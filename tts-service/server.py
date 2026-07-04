import asyncio
import os
import queue as stdlib_queue
import re
import struct
import threading
import time
import logging
import wave
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("qwen3-tts-server")

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
VOICES_DIR = Path(os.getenv("VOICES_DIR", "/data/voices"))
LANG_CODE = os.getenv("LANG_CODE", "french")
PROMPT_CACHE_DIR = Path(os.getenv("PROMPT_CACHE_DIR", "/data/prompt_cache"))
SAVE_OUTPUT = os.getenv("SAVE_OUTPUT", "false").lower() == "true"
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/data/output"))

torch.set_float32_matmul_precision("high")
torch.backends.cuda.matmul.allow_tf32 = True

# Single dedicated CUDA thread: torch.compile with CUDA graphs requires warmup
# and inference to run in the same OS thread.
_cuda_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cuda-tts")

app = FastAPI(title="Qwen3-TTS Server (OpenAI-compatible)")
model = None
warmup_prompt = None
voice_prompts: dict = {}  # key: (name, x_vector_only) -> prompt

LANG_MAP = {
    "french": "French", "fr": "French",
    "english": "English", "en": "English",
    "german": "German", "de": "German",
    "spanish": "Spanish", "es": "Spanish",
    "italian": "Italian", "it": "Italian",
    "portuguese": "Portuguese", "pt": "Portuguese",
    "chinese": "Chinese", "zh": "Chinese",
    "japanese": "Japanese", "ja": "Japanese",
    "korean": "Korean", "ko": "Korean",
}

HAS_FLASH_ATTN = False
try:
    import flash_attn
    HAS_FLASH_ATTN = True
    logger.info("flash-attn detected: %s", flash_attn.__version__)
except ImportError:
    logger.info("flash-attn not installed, using SDPA backend")


class SpeechRequest(BaseModel):
    input: str
    voice: str
    model: str = "tts-1"
    response_format: str = "wav"  # wav | pcm
    speed: float = 1.0
    language: str | None = None  # overrides LANG_CODE; e.g. "french", "en", "english"


# ── Voice prompt cache ─────────────────────────────────────────

def _find_voice_file(name: str) -> Path | None:
    for ext in (".wav", ".mp3", ".flac", ".m4a"):
        candidate = VOICES_DIR / f"{name}{ext}"
        if candidate.exists():
            return candidate
    subdir = VOICES_DIR / name
    if subdir.is_dir():
        for ext in (".wav", ".mp3", ".flac", ".m4a"):
            for f in subdir.glob(f"*{ext}"):
                return f
    return None


def _get_voice_ref_lang(name: str) -> str | None:
    """Retourne la langue de l'audio de référence depuis {voice}.lang, ou None."""
    lang_file = VOICES_DIR / f"{name}.lang"
    if lang_file.exists():
        return lang_file.read_text().strip().lower()
    return None


def _load_voice_prompt(name: str, x_vector_only: bool = False):
    suffix = ".xvec" if x_vector_only else ""
    cache_file = PROMPT_CACHE_DIR / f"{name}{suffix}.pt"
    if cache_file.exists():
        logger.info("Loading cached prompt for voice '%s' (xvec=%s)", name, x_vector_only)
        return torch.load(cache_file, weights_only=False)

    ref_audio = _find_voice_file(name)
    if ref_audio is None:
        return None

    ref_text_file = VOICES_DIR / f"{name}.txt"
    ref_text = ref_text_file.read_text().strip() if ref_text_file.exists() else ""

    # x_vector_only is forced when there is no reference text (full clone impossible)
    effective_xvec = x_vector_only or not bool(ref_text)
    logger.info("Creating voice clone prompt for '%s' (xvec=%s) from %s", name, effective_xvec, ref_audio)
    prompt = model.create_voice_clone_prompt(
        ref_audio=str(ref_audio),
        ref_text=ref_text,
        x_vector_only_mode=effective_xvec,
    )
    PROMPT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(prompt, cache_file)
    return prompt


def _get_voice_prompt(voice: str, x_vector_only: bool = False):
    key = (voice, x_vector_only)
    if key not in voice_prompts:
        prompt = _load_voice_prompt(voice, x_vector_only)
        if prompt is None:
            raise HTTPException(
                404,
                f"Voice '{voice}' not found. Place {voice}.wav (or .mp3/.flac) in {VOICES_DIR}",
            )
        voice_prompts[key] = prompt
    return voice_prompts[key]


def _resolve_x_vector_only(voice: str, gen_lang_code: str) -> bool:
    """
    Retourne True si la langue de l'audio de référence diffère de la langue de génération.
    Dans ce cas, le clonage en x_vector_only évite le transfert d'accent indésirable.
    Nécessite un fichier {voice}.lang dans VOICES_DIR (ex: 'french').
    """
    ref_lang = _get_voice_ref_lang(voice)
    if not ref_lang:
        return False
    ref_display = LANG_MAP.get(ref_lang, "")
    gen_display = LANG_MAP.get(gen_lang_code, "")
    cross_lang = bool(ref_display) and bool(gen_display) and ref_display != gen_display
    if cross_lang:
        logger.info("Cross-language cloning: ref='%s' gen='%s' → x_vector_only", ref_display, gen_display)
    return cross_lang


def _save_wav(voice: str, pcm_chunks: list, sample_rate: int) -> None:
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = OUTPUT_DIR / f"{ts}_{voice}.wav"
        all_pcm = np.concatenate(pcm_chunks)
        with wave.open(str(out_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(all_pcm.tobytes())
        logger.info("Saved output to %s (%d samples)", out_path, len(all_pcm))
    except Exception as e:
        logger.error("Failed to save output: %s", e)


# ── Startup (inside the CUDA thread) ───────────────────────────

def _do_startup():
    global model, warmup_prompt
    from qwen_tts import Qwen3TTSModel

    logger.info("Loading model %s on GPU...", MODEL_ID)
    load_kwargs = {"torch_dtype": torch.bfloat16, "device_map": "cuda"}
    if not HAS_FLASH_ATTN:
        load_kwargs["attn_implementation"] = "sdpa"

    model = Qwen3TTSModel.from_pretrained(MODEL_ID, **load_kwargs)
    logger.info("Model loaded (attn: %s). Enabling streaming optimizations...",
                "flash_attention_2" if HAS_FLASH_ATTN else "sdpa")

    model.enable_streaming_optimizations(
        decode_window_frames=80,
        use_compile=True,
        compile_mode="reduce-overhead",
    )
    logger.info("Warming up (torch.compile first pass)...")

    warmup_audio = (np.zeros(16000, dtype=np.float32), 16000)
    warmup_prompt = model.create_voice_clone_prompt(
        ref_audio=warmup_audio,
        ref_text="",
        x_vector_only_mode=True,
    )
    warmup_prompt[0].ref_spk_embedding = torch.zeros(1, 2048, dtype=torch.bfloat16, device="cuda")
    for _ in model.stream_generate_voice_clone(
        text="Warmup.", language="English", voice_clone_prompt=warmup_prompt, max_frames=24
    ):
        pass
    logger.info("Server ready. GPU: %s", torch.cuda.get_device_name(0))


@app.on_event("startup")
async def startup():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_cuda_executor, _do_startup)


# ── Endpoints ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    cached = [p.stem for p in PROMPT_CACHE_DIR.glob("*.pt")] if PROMPT_CACHE_DIR.exists() else []
    voice_langs = {}
    for f in VOICES_DIR.glob("*.lang"):
        voice_langs[f.stem] = f.read_text().strip()
    return {
        "status": "ok",
        "model": MODEL_ID,
        "default_language": LANG_CODE,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none",
        "attn_backend": "flash_attention_2" if HAS_FLASH_ATTN else "sdpa",
        "cached_voices": cached,
        "voice_languages": voice_langs,
        "save_output": SAVE_OUTPUT,
    }


@app.get("/v1/models")
async def list_models():
    return {"object": "list", "data": [{"id": MODEL_ID, "object": "model"}]}


_RETRY = object()

_SENTENCE_END = re.compile(r'(?<=[.!?;])\s+')
_NEWLINE = re.compile(r'\n+')


def _split_sentences(text: str, max_chars: int = 300) -> list[str]:
    text = _NEWLINE.sub('. ', text).strip()
    parts = [p.strip() for p in _SENTENCE_END.split(text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for part in parts:
        if not current:
            current = part
        elif len(current) + 1 + len(part) <= max_chars:
            current += " " + part
        else:
            chunks.append(current)
            current = part
    if current:
        chunks.append(current)
    result: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars:
            result.append(chunk)
            continue
        words = chunk.split()
        buf = ""
        for word in words:
            if not buf:
                buf = word
            elif len(buf) + 1 + len(word) <= max_chars:
                buf += " " + word
            else:
                result.append(buf)
                buf = word
        if buf:
            result.append(buf)
    return result or [text]


def _try_get(q: stdlib_queue.Queue):
    try:
        return q.get(timeout=0.05)
    except stdlib_queue.Empty:
        return _RETRY


@app.post("/v1/audio/speech")
async def speech(request: Request, req: SpeechRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded yet")

    gen_lang_code = (req.language or LANG_CODE).lower()
    language = LANG_MAP.get(gen_lang_code, "English")
    x_vector_only = _resolve_x_vector_only(req.voice, gen_lang_code)
    prompt = _get_voice_prompt(req.voice, x_vector_only)
    fmt = req.response_format.lower()
    t0 = time.monotonic()
    loop = asyncio.get_running_loop()

    sentences = _split_sentences(req.input)
    chunk_q: stdlib_queue.Queue = stdlib_queue.Queue(maxsize=3)
    stop_evt = threading.Event()

    def _put(data: bytes) -> bool:
        while not stop_evt.is_set():
            try:
                chunk_q.put(data, timeout=0.05)
                return True
            except stdlib_queue.Full:
                continue
        return False

    def _cuda_gen():
        try:
            header_sent = False
            n_total = 0
            last_sr = 24000
            pcm_chunks: list[np.ndarray] | None = [] if SAVE_OUTPUT else None

            logger.info("[%s] voice='%s' splitting into %d sentences", fmt, req.voice, len(sentences))
            for s_idx, sentence in enumerate(sentences):
                if stop_evt.is_set():
                    break
                s_max_frames = min(800, max(150, len(sentence) * 3))
                for audio_chunk, sr in model.stream_generate_voice_clone(
                    text=sentence,
                    language=language,
                    voice_clone_prompt=prompt,
                    first_chunk_emit_every=5,
                    first_chunk_decode_window=48,
                    first_chunk_frames=48,
                    emit_every_frames=12,
                    decode_window_frames=80,
                    overlap_samples=512,
                    repetition_penalty=1.05,
                    max_frames=s_max_frames,
                ):
                    if stop_evt.is_set():
                        break
                    last_sr = sr
                    pcm = (audio_chunk * 32767).clip(-32768, 32767).astype(np.int16)
                    if pcm_chunks is not None:
                        pcm_chunks.append(pcm.copy())
                    to_send = []
                    if fmt == "wav" and not header_sent:
                        to_send.append(struct.pack(
                            "<4sI4s4sIHHIIHH4sI",
                            b"RIFF", 0xFFFFFFFF, b"WAVE",
                            b"fmt ", 16, 1, 1, sr, sr * 2, 2, 16,
                            b"data", 0xFFFFFFFF,
                        ))
                        header_sent = True
                    to_send.append(pcm.tobytes())
                    for data in to_send:
                        if not _put(data):
                            break
                    n_total += 1

                # 150ms of silence between sentences for natural breathing
                if s_idx < len(sentences) - 1 and not stop_evt.is_set():
                    silence = np.zeros(int(last_sr * 0.15), dtype=np.int16)
                    if pcm_chunks is not None:
                        pcm_chunks.append(silence)
                    _put(silence.tobytes())

            logger.info("[%s] voice='%s' total_chunks=%d sentences=%d wall=%.2fs",
                        fmt, req.voice, n_total, len(sentences), time.monotonic() - t0)

            if pcm_chunks and not stop_evt.is_set():
                _save_wav(req.voice, pcm_chunks, last_sr)

        except Exception as e:
            logger.error("Generation error for voice '%s': %s", req.voice, e)
            try:
                chunk_q.put(e, block=False)
            except stdlib_queue.Full:
                pass
        finally:
            for _ in range(40):
                try:
                    chunk_q.put(None, block=False)
                    return
                except stdlib_queue.Full:
                    time.sleep(0.05)

    loop.run_in_executor(_cuda_executor, _cuda_gen)

    async def _watch_disconnect():
        try:
            msg = await request.receive()
            if msg.get("type") == "http.disconnect":
                stop_evt.set()
                try:
                    while True:
                        chunk_q.get_nowait()
                except stdlib_queue.Empty:
                    pass
                logger.warning("[%s] voice='%s' — disconnect after %.2fs",
                               fmt, req.voice, time.monotonic() - t0)
        except asyncio.CancelledError:
            pass

    disconnect_task = asyncio.create_task(_watch_disconnect())

    async def stream():
        try:
            while True:
                item = await loop.run_in_executor(None, _try_get, chunk_q)
                if item is _RETRY:
                    continue
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                yield item
        except GeneratorExit:
            stop_evt.set()
            logger.warning("[%s] voice='%s' — GeneratorExit after %.2fs",
                           fmt, req.voice, time.monotonic() - t0)
            try:
                while True:
                    chunk_q.get_nowait()
            except stdlib_queue.Empty:
                pass
            raise
        finally:
            disconnect_task.cancel()

    media_type = "audio/pcm" if fmt == "pcm" else "audio/wav"
    return StreamingResponse(stream(), media_type=media_type)
