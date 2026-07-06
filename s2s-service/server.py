"""
Local speech-to-speech backend for Zetora's Voice page.

Speaks the same OpenAI Realtime protocol subset the client already speaks to
the cloud (xAI) backend, over ws:///v1/realtime, so hooks/use-voice-client.ts
only needs a connection-target branch, not a rewrite (see the plan in
.claude/plans — cloud vs local voice backend).

Unlike huggingface/speech-to-speech (which runs STT/LLM/TTS in-process), this
server stays a thin orchestrator: Silero VAD for turn-taking is the only
model that runs here. STT, the LLM, and TTS are resolved by the Zetora app
itself — this service calls back into /api/transcribe, /api/v1/chat/completions
and /api/tts/stream so the user's configured providers, selected model, and
PII-anonymization middleware all apply exactly as they do in text chat. Every
callback carries the short-lived Bearer token minted by
/api/voice/local-session; this service never authenticates it itself, it just
forwards it and lets those routes 401 if it's invalid or expired.

Audio is normalized to 16-bit PCM mono at 48kHz in both directions (matching
the client's capture/playback pipeline) so no client-side resampling is
needed. The TTS leg assumes the configured Custom TTS Server outputs 24kHz
PCM — the same fixed assumption contexts/speech-context.tsx already makes for
"read aloud" — and this service resamples 24kHz -> 48kHz before forwarding to
the client.
"""

import asyncio
import base64
import io
import json
import logging
import os
import wave
from dataclasses import dataclass, field

import httpx
import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("s2s-service")

APP_URL = os.getenv("APP_URL", "http://zetora-app:3333").rstrip("/")
REQUEST_TIMEOUT_S = float(os.getenv("REQUEST_TIMEOUT_S", "30"))

CLIENT_SAMPLE_RATE = 48000  # fixed: matches the client's capture/playback AudioContext
TTS_SAMPLE_RATE = int(os.getenv("TTS_SAMPLE_RATE", "24000"))  # matches contexts/speech-context.tsx
VAD_SAMPLE_RATE = 16000  # Silero VAD's native rate
VAD_FRAME_SAMPLES = 512  # 32ms @ 16kHz, Silero's expected chunk size

VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "0.5"))
VAD_MIN_SILENCE_MS = int(os.getenv("VAD_MIN_SILENCE_MS", "500"))
VAD_SPEECH_PAD_MS = int(os.getenv("VAD_SPEECH_PAD_MS", "200"))

DEFAULT_INSTRUCTIONS = (
    "You are a helpful voice assistant. Keep replies short and conversational — "
    "this is a spoken conversation, not a written document."
)

vad_model = None


def _load_vad():
    global vad_model
    from silero_vad import load_silero_vad

    vad_model = load_silero_vad()
    logger.info("Silero VAD loaded")


# ── Audio helpers ────────────────────────────────────────────────


def pcm16_bytes_to_float32(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0


def float32_to_pcm16_bytes(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


def decimate_48k_to_16k(pcm48k: bytes) -> np.ndarray:
    """Crude downsample for VAD only (not used for STT, which gets the
    original 48kHz audio) — good enough for speech/silence detection."""
    samples = pcm16_bytes_to_float32(pcm48k)
    return samples[::3]


def resample_linear(samples: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or len(samples) == 0:
        return samples
    duration = len(samples) / src_rate
    dst_len = max(1, int(duration * dst_rate))
    src_x = np.linspace(0, duration, num=len(samples), endpoint=False)
    dst_x = np.linspace(0, duration, num=dst_len, endpoint=False)
    return np.interp(dst_x, src_x, samples).astype(np.float32)


def pcm48k_to_wav_bytes(pcm48k: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(CLIENT_SAMPLE_RATE)
        wf.writeframes(pcm48k)
    return buf.getvalue()


# ── Turn-taking state machine (per connection) ──────────────────


@dataclass
class VoiceSession:
    token: str = ""
    instructions: str = DEFAULT_INSTRUCTIONS
    history: list = field(default_factory=list)

    is_speaking: bool = False
    vad_carry: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))
    silence_frames: int = 0
    utterance_buf: bytearray = field(default_factory=bytearray)

    processing: bool = False
    current_task: "asyncio.Task | None" = None


def _auth_headers(session: VoiceSession) -> dict:
    return {"Authorization": f"Bearer {session.token}"} if session.token else {}


async def send_json(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_text(json.dumps(payload))
    except Exception:
        pass  # connection already closing; nothing useful to do


async def send_error(ws: WebSocket, message: str) -> None:
    logger.warning("voice session error: %s", message)
    await send_json(ws, {"type": "error", "error": {"message": message}})


# ── STT / LLM / TTS callbacks into the Zetora app ────────────────


async def transcribe_utterance(client: httpx.AsyncClient, session: VoiceSession, pcm48k: bytes) -> str:
    wav_bytes = pcm48k_to_wav_bytes(pcm48k)
    response = await client.post(
        f"{APP_URL}/api/transcribe",
        headers=_auth_headers(session),
        files={"audio": ("audio.wav", wav_bytes, "audio/wav")},
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    data = response.json()
    return (data.get("text") or "").strip()


async def synthesize_and_send(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, text: str) -> None:
    text = text.strip()
    if not text:
        return

    async with client.stream(
        "POST",
        f"{APP_URL}/api/tts/stream",
        headers={**_auth_headers(session), "Content-Type": "application/json"},
        json={"text": text},
        timeout=REQUEST_TIMEOUT_S,
    ) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            if not chunk:
                continue
            samples = pcm16_bytes_to_float32(chunk)
            resampled = resample_linear(samples, TTS_SAMPLE_RATE, CLIENT_SAMPLE_RATE)
            delta_b64 = base64.b64encode(float32_to_pcm16_bytes(resampled)).decode("ascii")
            await send_json(ws, {"type": "response.output_audio.delta", "delta": delta_b64})


_SENTENCE_END = (".", "!", "?", "\n")


async def run_turn(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, pcm48k: bytes) -> None:
    try:
        transcript = await transcribe_utterance(client, session, pcm48k)
    except Exception as exc:
        await send_error(ws, f"Transcription failed: {exc}")
        return

    if not transcript:
        return

    await send_json(
        ws, {"type": "conversation.item.input_audio_transcription.completed", "transcript": transcript}
    )

    session.history.append({"role": "user", "content": transcript})
    await send_json(ws, {"type": "response.created"})

    messages = [{"role": "system", "content": session.instructions}, *session.history]
    assistant_text = ""
    sentence_buf = ""

    try:
        async with client.stream(
            "POST",
            f"{APP_URL}/api/v1/chat/completions",
            headers={**_auth_headers(session), "Content-Type": "application/json"},
            # The LLM is resolved server-side from Settings > Tertiary Models
            # > Voice — no model field needed here.
            json={"messages": messages, "stream": True},
            timeout=REQUEST_TIMEOUT_S,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload == "[DONE]":
                    break
                chunk = json.loads(payload)
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content") or ""
                if not delta:
                    continue

                assistant_text += delta
                sentence_buf += delta
                await send_json(ws, {"type": "response.output_audio_transcript.delta", "delta": delta})

                if sentence_buf.strip() and sentence_buf.rstrip()[-1:] in _SENTENCE_END:
                    await synthesize_and_send(client, ws, session, sentence_buf)
                    sentence_buf = ""

        if sentence_buf.strip():
            await synthesize_and_send(client, ws, session, sentence_buf)

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        await send_error(ws, f"Response generation failed: {exc}")
        return

    if assistant_text.strip():
        session.history.append({"role": "assistant", "content": assistant_text.strip()})
    await send_json(ws, {"type": "response.output_audio_transcript.done"})
    await send_json(ws, {"type": "response.done"})


# ── VAD-driven turn boundaries ────────────────────────────────────


async def feed_vad(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, pcm48k: bytes) -> None:
    if session.is_speaking:
        session.utterance_buf.extend(pcm48k)

    down = np.concatenate([session.vad_carry, decimate_48k_to_16k(pcm48k)])
    n_frames = len(down) // VAD_FRAME_SAMPLES
    consumed = n_frames * VAD_FRAME_SAMPLES
    session.vad_carry = down[consumed:]

    for i in range(n_frames):
        frame = down[i * VAD_FRAME_SAMPLES : (i + 1) * VAD_FRAME_SAMPLES]
        with torch.no_grad():
            prob = vad_model(torch.from_numpy(frame), VAD_SAMPLE_RATE).item()

        frame_ms = (VAD_FRAME_SAMPLES / VAD_SAMPLE_RATE) * 1000

        if prob >= VAD_THRESHOLD:
            session.silence_frames = 0
            if not session.is_speaking:
                session.is_speaking = True
                session.utterance_buf = bytearray()
                if session.current_task and not session.current_task.done():
                    # Barge-in: user started talking while the assistant was
                    # still responding — stop generating/streaming further
                    # audio for the previous turn.
                    session.current_task.cancel()
                    await send_json(ws, {"type": "response.done"})
                await send_json(ws, {"type": "input_audio_buffer.speech_started"})
        elif session.is_speaking:
            session.silence_frames += 1
            if session.silence_frames * frame_ms >= VAD_MIN_SILENCE_MS:
                session.is_speaking = False
                session.silence_frames = 0
                await send_json(ws, {"type": "input_audio_buffer.speech_stopped"})

                utterance = bytes(session.utterance_buf)
                session.utterance_buf = bytearray()
                if not session.processing and len(utterance) > 0:
                    session.processing = True

                    async def _run(u=utterance):
                        try:
                            await run_turn(client, ws, session, u)
                        finally:
                            session.processing = False

                    session.current_task = asyncio.create_task(_run())


# ── FastAPI app ────────────────────────────────────────────────


app = FastAPI(title="Zetora local speech-to-speech")


@app.on_event("startup")
async def _startup():
    await asyncio.get_event_loop().run_in_executor(None, _load_vad)
    logger.info("s2s-service ready — APP_URL=%s", APP_URL)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "app_url": APP_URL})


@app.websocket("/v1/realtime")
async def realtime(ws: WebSocket):
    await ws.accept()
    session = VoiceSession(token=ws.query_params.get("token", ""))

    async with httpx.AsyncClient() as client:
        await send_json(ws, {"type": "conversation.created"})

        try:
            while True:
                raw = await ws.receive_text()
                message = json.loads(raw)
                msg_type = message.get("type")

                if msg_type == "session.update":
                    update = message.get("session", {})
                    session.instructions = update.get("instructions") or DEFAULT_INSTRUCTIONS
                    await send_json(ws, {"type": "session.updated"})

                elif msg_type == "input_audio_buffer.append":
                    audio_b64 = message.get("audio")
                    if not audio_b64:
                        continue
                    pcm48k = base64.b64decode(audio_b64)
                    await feed_vad(client, ws, session, pcm48k)

        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("voice session crashed")
        finally:
            if session.current_task and not session.current_task.done():
                session.current_task.cancel()
