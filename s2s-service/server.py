"""
Local speech-to-speech backend for Zetora's Voice page.

Speaks the same OpenAI Realtime protocol subset the client already speaks to
the cloud (xAI) backend, over ws:///v1/realtime, so hooks/use-voice-client.ts
only needs a connection-target branch, not a rewrite.

Unlike huggingface/speech-to-speech (which runs STT/LLM/TTS in-process), this
server stays a thin orchestrator: Silero VAD for turn-taking is the only
model that runs here. STT, the LLM, and TTS are resolved by the Zetora app
itself — this service calls back into /api/transcribe, /api/v1/chat/completions
and /api/tts/stream so the user's configured providers, selected model, and
PII-anonymization middleware all apply exactly as they do in text chat. Every
callback carries the short-lived Bearer token minted by
/api/voice/local-session; this service never authenticates it itself, it just
forwards it and lets those routes 401 if it's invalid or expired.

A connection opened with ?agent=hermes takes its replies from the user's Hermes
agent (/api/voice/hermes) instead of /api/v1/chat/completions; that route saves the
conversation as an Agent chat. Replies of the Voice model are saved as a chat
through /api/voice/transcript, one turn at a time. ?chat=<id> continues an existing
chat: Hermes keeps its own history, the Voice model gets the chat's latest messages.

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
import uuid
import wave
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import httpx
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("s2s-service")

APP_URL = os.getenv("APP_URL", "http://zetora-app:3333").rstrip("/")
REQUEST_TIMEOUT_S = float(os.getenv("REQUEST_TIMEOUT_S", "30"))
# How long a closing connection waits for its last turns to be saved.
SAVE_FLUSH_TIMEOUT_S = 10.0

CLIENT_SAMPLE_RATE = 48000  # fixed: matches the client's capture/playback AudioContext
TTS_SAMPLE_RATE = int(os.getenv("TTS_SAMPLE_RATE", "24000"))  # matches contexts/speech-context.tsx
VAD_SAMPLE_RATE = 16000  # Silero VAD's native rate
VAD_FRAME_SAMPLES = 512  # 32ms @ 16kHz, Silero's expected chunk size
VAD_CONTEXT_SAMPLES = 64  # Silero's fixed lookback window at 16kHz
VAD_STATE_SHAPE = (2, 1, 128)
VAD_MODEL_PATH = os.getenv("VAD_MODEL_PATH", "/app/silero_vad.onnx")

VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "0.5"))
VAD_MIN_SILENCE_MS = int(os.getenv("VAD_MIN_SILENCE_MS", "500"))
VAD_SPEECH_PAD_MS = int(os.getenv("VAD_SPEECH_PAD_MS", "200"))
# Speech shorter than this is a breath, a click or a burst of noise, not an utterance:
# sent to STT, it comes back as a filler word ("Okay.", "Mm-hmm.") the user never said.
VAD_MIN_SPEECH_MS = int(os.getenv("VAD_MIN_SPEECH_MS", "250"))
# While the assistant's voice plays, a phone speaker leaks it back into the microphone in
# bursts that echo cancellation misses. Interrupting the reply then takes louder, longer
# speech, so the assistant does not cut itself off.
VAD_BARGE_IN_THRESHOLD = float(os.getenv("VAD_BARGE_IN_THRESHOLD", "0.8"))
VAD_BARGE_IN_MIN_SPEECH_MS = int(os.getenv("VAD_BARGE_IN_MIN_SPEECH_MS", "700"))
# A pause this short inside the first words of an utterance does not restart the count.
VAD_ONSET_GAP_MS = 200
# The client buffers audio before playing it, so its playback ends a little after ours.
PLAYBACK_TAIL_S = 0.5

DEFAULT_INSTRUCTIONS = (
    "You are a helpful voice assistant. Keep replies short and conversational — "
    "this is a spoken conversation, not a written document."
)

# Direct onnxruntime inference (no torch): the .onnx graph is stateful
# (recurrent `state` + a fixed-size `context` lookback prepended to each
# chunk), matching the upstream OnnxWrapper calling convention from
# https://github.com/snakers4/silero-vad. The session/graph is shared and
# reentrant across connections; the mutable state/context arrays live on
# each VoiceSession instead, so concurrent calls don't corrupt each other.
vad_session: "ort.InferenceSession | None" = None


def _load_vad():
    global vad_session
    opts = ort.SessionOptions()
    opts.inter_op_num_threads = 1
    opts.intra_op_num_threads = 1
    vad_session = ort.InferenceSession(VAD_MODEL_PATH, sess_options=opts, providers=["CPUExecutionProvider"])
    logger.info("Silero VAD (onnxruntime) loaded from %s", VAD_MODEL_PATH)


def run_vad_frame(chunk: np.ndarray, session: "VoiceSession") -> float:
    """chunk: exactly VAD_FRAME_SAMPLES float32 samples at 16kHz."""
    x = np.concatenate([session.vad_context, chunk[np.newaxis, :].astype(np.float32)], axis=1)
    ort_inputs = {
        "input": x,
        "state": session.vad_state,
        "sr": np.array(VAD_SAMPLE_RATE, dtype=np.int64),
    }
    out, state = vad_session.run(None, ort_inputs)
    session.vad_state = state
    session.vad_context = x[:, -VAD_CONTEXT_SAMPLES:]
    return float(out[0, 0])


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


class StreamResampler:
    """Linear resampler for a stream that arrives in chunks. It keeps the
    last sample and the output phase between chunks: resampling each chunk
    on its own restarts the grid at every boundary, which clicks."""

    def __init__(self, src_rate: int, dst_rate: int):
        self.passthrough = src_rate == dst_rate
        self.step = src_rate / dst_rate  # source samples per output sample
        self.pos = 0.0  # next output position, in samples from the start of the buffer
        self.prev: "np.ndarray | None" = None

    def process(self, samples: np.ndarray) -> np.ndarray:
        if self.passthrough or len(samples) == 0:
            return samples
        buf = samples if self.prev is None else np.concatenate([self.prev, samples])
        last = len(buf) - 1
        count = int((last - self.pos) // self.step) + 1 if last >= self.pos else 0
        positions = self.pos + np.arange(count) * self.step
        out = np.interp(positions, np.arange(len(buf)), buf).astype(np.float32)
        # The next buffer starts at this one's last sample.
        self.pos += count * self.step - last
        self.prev = buf[-1:]
        return out


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
    # "hermes" sends each turn to the user's Hermes agent, in a Zetora chat of its own,
    # instead of the Voice model. The agent keeps its own history and instructions.
    agent: str = "zetora"
    chat_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    # Finished turns waiting to be saved, in order (Zetora mode only).
    saves: "asyncio.Queue[list[dict]]" = field(default_factory=asyncio.Queue)

    is_speaking: bool = False
    vad_carry: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))
    vad_state: np.ndarray = field(default_factory=lambda: np.zeros(VAD_STATE_SHAPE, dtype=np.float32))
    vad_context: np.ndarray = field(default_factory=lambda: np.zeros((1, VAD_CONTEXT_SAMPLES), dtype=np.float32))
    silence_frames: int = 0
    # Frames since speech seemed to start, before it has lasted long enough to count, and
    # the trailing run of non-speech frames among them.
    onset_frames: int = 0
    onset_gap_frames: int = 0
    # Event-loop time at which the client finishes playing the audio sent so far.
    playback_until: float = 0.0
    utterance_buf: bytearray = field(default_factory=bytearray)
    # Rolling pre-speech audio, kept so the first syllables of an utterance
    # (clipped by VAD's rising-edge latency and the minimum speech duration)
    # aren't lost — every new utterance_buf starts from this.
    preroll: bytearray = field(default_factory=bytearray)

    processing: bool = False
    current_task: "asyncio.Task | None" = None
    # True once the in-flight turn has finished STT and moved on to LLM/TTS —
    # i.e. it's actually producing a response, so new speech is a real
    # barge-in. While STT is still running, the previous utterance hasn't
    # been transcribed yet, so cancelling it would silently drop it instead.
    response_active: bool = False
    # The audio last handed to run_turn — re-prepended to the next utterance
    # if we have to cancel that turn before its STT call has returned.
    pending_audio: bytes = b""
    # A typed message (conversation.item.create), answered on response.create.
    pending_text: str = ""


def _auth_headers(session: VoiceSession) -> dict:
    return {"Authorization": f"Bearer {session.token}"} if session.token else {}


async def _raise_for_status(response: httpx.Response) -> None:
    """Like raise_for_status, but with the app's error body, which says what
    to configure ("Custom TTS provider not configured", ...), in the message."""
    if response.is_error:
        body = (await response.aread()).decode("utf-8", errors="replace").strip()
        try:
            parsed = json.loads(body)
            message = parsed.get("error") or parsed.get("cause") if isinstance(parsed, dict) else None
            if isinstance(message, str) and message:
                body = message
        except ValueError:
            pass
        raise RuntimeError(f"{response.status_code} from {response.url.path}: {body[:300] or response.reason_phrase}")


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
    await _raise_for_status(response)
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
        await _raise_for_status(response)
        resampler = StreamResampler(TTS_SAMPLE_RATE, CLIENT_SAMPLE_RATE)
        # Network chunks can split a 16-bit sample: the odd byte waits for the next chunk.
        carry = b""
        async for chunk in response.aiter_bytes():
            data = carry + chunk
            usable = len(data) - len(data) % 2
            carry = data[usable:]
            if usable == 0:
                continue
            resampled = resampler.process(pcm16_bytes_to_float32(data[:usable]))
            if len(resampled) == 0:
                continue
            now = asyncio.get_running_loop().time()
            session.playback_until = max(session.playback_until, now) + len(resampled) / CLIENT_SAMPLE_RATE
            delta_b64 = base64.b64encode(float32_to_pcm16_bytes(resampled)).decode("ascii")
            await send_json(ws, {"type": "response.output_audio.delta", "delta": delta_b64})


_SENTENCE_END = (".", "!", "?", "\n")


async def run_turn(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, pcm48k: bytes) -> None:
    try:
        transcript = await transcribe_utterance(client, session, pcm48k)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        await send_error(ws, f"Transcription failed: {exc}")
        # The client went to "thinking" on speech_stopped: every turn ends with response.done.
        await send_json(ws, {"type": "response.done"})
        return

    # STT is done — from here on this task is actually producing a response,
    # so if the user starts talking again it's a genuine barge-in rather than
    # speech that overlapped with (and should be merged into) transcription.
    session.response_active = True

    if not transcript:
        await send_json(ws, {"type": "response.done"})
        return

    await send_json(
        ws, {"type": "conversation.item.input_audio_transcription.completed", "transcript": transcript}
    )

    session.history.append({"role": "user", "content": transcript})
    await respond(client, ws, session)


async def run_text_turn(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, text: str) -> None:
    # The client already shows the typed message: no transcription event.
    session.response_active = True
    session.history.append({"role": "user", "content": text})
    await respond(client, ws, session)


def reply_request(session: VoiceSession) -> tuple[str, dict]:
    """The app route that streams the reply to the last user message, and its body. Both
    answer in the same OpenAI-style SSE."""
    if session.agent == "hermes":
        return f"{APP_URL}/api/voice/hermes", {"chatId": session.chat_id, "text": session.history[-1]["content"]}
    # The LLM is resolved server-side from Settings > Tertiary Models > Voice — no model
    # field needed here.
    messages = [{"role": "system", "content": session.instructions}, *session.history]
    return f"{APP_URL}/api/v1/chat/completions", {"messages": messages, "stream": True}


async def respond(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession) -> None:
    await send_json(ws, {"type": "response.created"})

    url, body = reply_request(session)
    user_text = session.history[-1]["content"]
    assistant_text = ""
    sentence_buf = ""

    try:
        async with client.stream(
            "POST",
            url,
            headers={**_auth_headers(session), "Content-Type": "application/json"},
            json=body,
            timeout=REQUEST_TIMEOUT_S,
        ) as response:
            await _raise_for_status(response)
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload == "[DONE]":
                    break
                chunk = json.loads(payload)
                error = chunk.get("error")
                if error:
                    raise RuntimeError(error.get("message") if isinstance(error, dict) else str(error))
                tool = chunk.get("tool")
                if isinstance(tool, dict):
                    await send_tool_step(ws, tool)
                    continue
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
        await send_json(ws, {"type": "response.done"})
        return
    finally:
        # A reply cut short by the user is saved as far as it got.
        if session.agent == "zetora":
            turn = [{"role": "user", "text": user_text}]
            if assistant_text.strip():
                turn.append({"role": "assistant", "text": assistant_text.strip()})
            session.saves.put_nowait(turn)

    if assistant_text.strip():
        session.history.append({"role": "assistant", "content": assistant_text.strip()})
    await send_json(ws, {"type": "response.output_audio_transcript.done"})
    await send_json(ws, {"type": "response.done"})


async def send_tool_step(ws: WebSocket, tool: dict) -> None:
    """A tool step of the Hermes agent, as the realtime events the Voice page already shows
    for the cloud backend's tool calls. A successful finish adds nothing worth showing."""
    call_id, name = tool.get("callId"), tool.get("name")
    status = tool.get("status")
    if status == "running":
        preview = tool.get("preview")
        await send_json(ws, {
            "type": "response.output_item.done",
            "item": {
                "type": "function_call",
                "call_id": call_id,
                "name": name,
                "arguments": json.dumps({"query": preview} if preview else {}),
            },
        })
    elif status != "ok":
        await send_json(ws, {
            "type": "conversation.item.added",
            "item": {"type": "function_call_output", "call_id": call_id, "name": name, "output": status},
        })


async def load_history(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession) -> None:
    """The continued chat's latest messages, as the Voice model's conversation so far."""
    try:
        response = await client.get(
            f"{APP_URL}/api/voice/transcript",
            headers=_auth_headers(session),
            params={"chatId": session.chat_id},
            timeout=REQUEST_TIMEOUT_S,
        )
        await _raise_for_status(response)
        session.history = response.json()["messages"]
    except Exception as exc:
        await send_error(ws, f"Loading the conversation failed: {exc}")


async def save_turns(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession) -> None:
    """Saves each finished turn of the session, one after the other so the chat keeps their
    order."""
    while True:
        messages = await session.saves.get()
        try:
            response = await client.post(
                f"{APP_URL}/api/voice/transcript",
                headers=_auth_headers(session),
                json={"chatId": session.chat_id, "messages": messages},
                timeout=REQUEST_TIMEOUT_S,
            )
            await _raise_for_status(response)
        except Exception as exc:
            await send_error(ws, f"Saving the conversation failed: {exc}")
        finally:
            session.saves.task_done()


# ── VAD-driven turn boundaries ────────────────────────────────────


def pcm48k_bytes_for_ms(ms: float) -> int:
    return int(CLIENT_SAMPLE_RATE * ms / 1000) * 2  # 16-bit mono PCM


VAD_FRAME_MS = VAD_FRAME_SAMPLES / VAD_SAMPLE_RATE * 1000
# Long enough to hold the padding and the longest onset an utterance can need.
PREROLL_MAX_BYTES = pcm48k_bytes_for_ms(
    VAD_SPEECH_PAD_MS + max(VAD_MIN_SPEECH_MS, VAD_BARGE_IN_MIN_SPEECH_MS) + VAD_ONSET_GAP_MS
)


def assistant_is_playing(session: VoiceSession) -> bool:
    return asyncio.get_running_loop().time() < session.playback_until + PLAYBACK_TAIL_S


def onset_confirmed(session: VoiceSession, prob: float) -> bool:
    """Counts a frame toward the start of an utterance; True once speech has lasted long
    enough to be one."""
    playing = assistant_is_playing(session)
    threshold = VAD_BARGE_IN_THRESHOLD if playing else VAD_THRESHOLD
    if prob >= threshold:
        session.onset_frames += 1
        session.onset_gap_frames = 0
        min_speech_ms = VAD_BARGE_IN_MIN_SPEECH_MS if playing else VAD_MIN_SPEECH_MS
        return session.onset_frames * VAD_FRAME_MS >= min_speech_ms
    if session.onset_frames:
        session.onset_frames += 1
        session.onset_gap_frames += 1
        if session.onset_gap_frames * VAD_FRAME_MS >= VAD_ONSET_GAP_MS:
            session.onset_frames = session.onset_gap_frames = 0
    return False


async def feed_vad(client: httpx.AsyncClient, ws: WebSocket, session: VoiceSession, pcm48k: bytes) -> None:
    if session.is_speaking:
        session.utterance_buf.extend(pcm48k)
    else:
        # The audio before speech is confirmed: it holds the onset itself, plus
        # VAD_SPEECH_PAD_MS before it, since Silero's rising edge lags the true start of
        # speech by a frame or two. The chunk being analyzed is never trimmed: speech can
        # be confirmed on any of its frames.
        session.preroll.extend(pcm48k)
        excess = len(session.preroll) - PREROLL_MAX_BYTES - len(pcm48k)
        if excess > 0:
            del session.preroll[:excess]

    down = np.concatenate([session.vad_carry, decimate_48k_to_16k(pcm48k)])
    n_frames = len(down) // VAD_FRAME_SAMPLES
    consumed = n_frames * VAD_FRAME_SAMPLES
    session.vad_carry = down[consumed:]

    for i in range(n_frames):
        frame = down[i * VAD_FRAME_SAMPLES : (i + 1) * VAD_FRAME_SAMPLES]
        prob = run_vad_frame(frame, session)

        if not session.is_speaking:
            if not onset_confirmed(session, prob):
                continue
            # The preroll ends with the rest of the current chunk, after this frame.
            onset_bytes = pcm48k_bytes_for_ms(VAD_SPEECH_PAD_MS + session.onset_frames * VAD_FRAME_MS)
            preroll_bytes = bytes(session.preroll[-(onset_bytes + len(pcm48k)) :])
            session.preroll = bytearray()
            session.onset_frames = session.onset_gap_frames = 0
            session.is_speaking = True
            session.silence_frames = 0
            # The client stops playing when the user starts talking.
            session.playback_until = 0.0

            if session.current_task and not session.current_task.done():
                if session.response_active:
                    # True barge-in: the assistant is already generating/
                    # streaming a response — stop it and start a fresh
                    # utterance.
                    session.current_task.cancel()
                    await send_json(ws, {"type": "response.done"})
                    session.utterance_buf = bytearray(preroll_bytes)
                else:
                    # The previous utterance is still being transcribed.
                    # Cancelling it outright would silently drop those
                    # words, so cancel the in-flight STT call and merge
                    # its audio back in — the whole thing is re-sent as
                    # one utterance once the user pauses again.
                    session.current_task.cancel()
                    session.utterance_buf = bytearray(session.pending_audio)
                    session.utterance_buf.extend(preroll_bytes)
            else:
                session.utterance_buf = bytearray(preroll_bytes)

            await send_json(ws, {"type": "input_audio_buffer.speech_started"})
        elif prob >= VAD_THRESHOLD:
            session.silence_frames = 0
        else:
            session.silence_frames += 1
            if session.silence_frames * VAD_FRAME_MS >= VAD_MIN_SILENCE_MS:
                session.is_speaking = False
                session.silence_frames = 0
                await send_json(ws, {"type": "input_audio_buffer.speech_stopped"})

                utterance = bytes(session.utterance_buf)
                session.utterance_buf = bytearray()
                if len(utterance) == 0:
                    pass
                elif session.processing:
                    # Should not happen: the previous task is still running
                    # STT/LLM/TTS despite not being caught by the merge path
                    # above (e.g. cancellation hadn't been scheduled yet).
                    # Log rather than silently dropping the utterance.
                    logger.warning("dropping utterance: previous turn still processing")
                else:
                    session.pending_audio = utterance
                    start_turn(session, run_turn(client, ws, session, utterance))


def start_turn(session: VoiceSession, turn) -> None:
    """Runs `turn` (a coroutine) as the session's in-flight turn."""
    session.processing = True
    session.response_active = False

    def _done(task: asyncio.Task) -> None:
        # A done callback, not a `finally` around `await turn`: a task cancelled before its
        # first step never enters that block, and the session would stay `processing`,
        # dropping every utterance after it. A cancelled turn finishes after its
        # replacement has started: only the current turn may clear the flags.
        if session.current_task is task:
            session.processing = False
            session.response_active = False

    session.current_task = asyncio.create_task(turn)
    session.current_task.add_done_callback(_done)


async def cancel_turn(ws: WebSocket, session: VoiceSession) -> None:
    task = session.current_task
    if not task or task.done():
        return
    if session.response_active:
        await send_json(ws, {"type": "response.done"})
    else:
        logger.info("dropping an utterance still being transcribed: the user typed a message")
    task.cancel()


def input_text(item: object) -> str:
    """The text of a conversation.item.create user message, or ""."""
    if not isinstance(item, dict) or item.get("role") != "user":
        return ""
    parts = item.get("content")
    if not isinstance(parts, list):
        return ""
    texts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "input_text"]
    return " ".join(t for t in texts if isinstance(t, str)).strip()


# ── FastAPI app ────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.get_running_loop().run_in_executor(None, _load_vad)
    logger.info("s2s-service ready — APP_URL=%s", APP_URL)
    yield


app = FastAPI(title="Zetora local speech-to-speech", lifespan=lifespan)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "app_url": APP_URL})


@app.websocket("/v1/realtime")
async def realtime(ws: WebSocket):
    await ws.accept()
    session = VoiceSession(
        token=ws.query_params.get("token", ""),
        agent="hermes" if ws.query_params.get("agent") == "hermes" else "zetora",
    )
    # The app checks that the chat is this user's.
    if ws.query_params.get("chat"):
        session.chat_id = ws.query_params["chat"]

    async with httpx.AsyncClient() as client:
        saver = asyncio.create_task(save_turns(client, ws, session))
        if session.agent == "zetora" and ws.query_params.get("chat"):
            await load_history(client, ws, session)
        await send_json(ws, {"type": "conversation.created"})

        try:
            while True:
                raw = await ws.receive_text()
                message = json.loads(raw)
                msg_type = message.get("type")

                if msg_type == "session.update":
                    update = message.get("session", {})
                    # Partial updates (a voice change) keep the instructions.
                    if "instructions" in update:
                        session.instructions = update.get("instructions") or DEFAULT_INSTRUCTIONS
                    await send_json(ws, {"type": "session.updated"})

                elif msg_type == "conversation.item.create":
                    text = input_text(message.get("item"))
                    if text:
                        session.pending_text = text

                elif msg_type == "response.create":
                    text, session.pending_text = session.pending_text, ""
                    if text:
                        await cancel_turn(ws, session)
                        start_turn(session, run_text_turn(client, ws, session, text))

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
            task = session.current_task
            if task and not task.done():
                task.cancel()
                # The cancelled turn queues what it said before it ends.
                await asyncio.gather(task, return_exceptions=True)
            try:
                await asyncio.wait_for(session.saves.join(), SAVE_FLUSH_TIMEOUT_S)
            except asyncio.TimeoutError:
                logger.warning("closing with %d voice turns unsaved", session.saves.qsize())
            saver.cancel()
