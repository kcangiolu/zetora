import asyncio
import gc
import os
from collections import OrderedDict
from contextlib import asynccontextmanager
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
# Default is lazy-load (model loads on first request). Set to reclaim the old
# always-resident behavior, e.g. when the GPU is dedicated to this service.
EAGER_LOAD = os.getenv("EAGER_LOAD", "false").lower() == "true"

# GPU is shared with other services on the box (Ollama, ComfyUI, ...) and
# stays scarce even at idle — unload the model after 5 minutes of inactivity
# instead of holding VRAM hostage between requests.
IDLE_UNLOAD_TIMEOUT_S = 300

torch.set_float32_matmul_precision("high")
torch.backends.cuda.matmul.allow_tf32 = True

# Single dedicated CUDA thread: torch.compile with CUDA graphs requires warmup
# and inference to run in the same OS thread.
_cuda_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cuda-tts")

model = None
warmup_prompt = None
_last_used = time.monotonic()
# LRU-bounded prompt cache: prompts hold GPU tensors, so cap how many voices
# stay resident. key: (name, x_vector_only) -> prompt
VOICE_PROMPT_CACHE_SIZE = int(os.getenv("VOICE_PROMPT_CACHE_SIZE", "8"))
voice_prompts: OrderedDict = OrderedDict()

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

# flash-attn IMPORTS fine even when no kernel was compiled for the current
# GPU arch (a wheel built without sm_120 imports happily on a Blackwell
# RTX 5060 Ti, then crashes on the first forward). Import proves nothing:
# only a real kernel executed on the device does. HAS_FLASH_ATTN is set at
# startup by _flash_attn_usable(), inside the CUDA thread. This makes a
# single image universal: flash where the kernel exists, SDPA fallback,
# no crash — RTX 3090 (sm_86) and RTX 5060 Ti (sm_120) alike.
_FLASH_IMPORTED = False
try:
    import flash_attn
    _FLASH_IMPORTED = True
    logger.info("flash-attn present: %s (kernel probe pending)", flash_attn.__version__)
except ImportError:
    logger.info("flash-attn not installed, using SDPA backend")

HAS_FLASH_ATTN = False


def _flash_attn_usable() -> bool:
    """Run a real flash-attn kernel on the GPU. Only a successful forward
    proves the wheel covers THIS device's architecture."""
    if not _FLASH_IMPORTED:
        return False
    try:
        from flash_attn import flash_attn_func
        q = torch.zeros(1, 2, 8, 64, dtype=torch.bfloat16, device="cuda")
        flash_attn_func(q, q, q)
        torch.cuda.synchronize()
        logger.info("flash-attn kernel OK on %s", torch.cuda.get_device_name(0))
        return True
    except Exception as e:
        logger.warning(
            "flash-attn imported but unusable on this GPU (%s: %s) — falling "
            "back to SDPA. GPU=%s",
            type(e).__name__, e, torch.cuda.get_device_name(0),
        )
        return False


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
    """Return the reference audio's language from {voice}.lang, or None."""
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
    if key in voice_prompts:
        voice_prompts.move_to_end(key)
        return voice_prompts[key]

    prompt = _load_voice_prompt(voice, x_vector_only)
    if prompt is None:
        raise HTTPException(
            404,
            f"Voice '{voice}' not found. Place {voice}.wav (or .mp3/.flac) in {VOICES_DIR}",
        )
    voice_prompts[key] = prompt
    while len(voice_prompts) > VOICE_PROMPT_CACHE_SIZE:
        evicted, _ = voice_prompts.popitem(last=False)
        logger.info("Evicted voice prompt %s from cache (size cap %d)", evicted, VOICE_PROMPT_CACHE_SIZE)
    return voice_prompts[key]


def _resolve_x_vector_only(voice: str, gen_lang_code: str) -> bool:
    """
    Return True when the reference audio's language differs from the generation
    language; x_vector_only cloning then avoids unwanted accent transfer.
    Requires a {voice}.lang file in VOICES_DIR (e.g. 'french').
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


# ── Model load / unload (inside the CUDA thread) ────────────────

def _load_model():
    global model, warmup_prompt, HAS_FLASH_ATTN
    from qwen_tts import Qwen3TTSModel

    # Probe the kernel on the real device (CUDA thread) before picking the backend.
    HAS_FLASH_ATTN = _flash_attn_usable()

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


def _reload_if_needed():
    """Runs on the CUDA thread; safe to call from multiple concurrent
    requests since _cuda_executor serializes them (FIFO, 1 worker)."""
    if model is None:
        _load_model()


def _unload_model():
    """Runs on the CUDA thread. Voice prompts also hold GPU tensors
    (ref_spk_embedding etc.) so they're dropped too, not just the model."""
    global model, warmup_prompt
    if model is None:
        return
    logger.info("Idle for %ds — unloading TTS model to free VRAM", IDLE_UNLOAD_TIMEOUT_S)
    model = None
    warmup_prompt = None
    voice_prompts.clear()
    torch.cuda.empty_cache()
    gc.collect()
    logger.info("TTS model unloaded, GPU memory freed")


def _maybe_unload():
    if model is not None and (time.monotonic() - _last_used) >= IDLE_UNLOAD_TIMEOUT_S:
        _unload_model()


def _idle_checker():
    while True:
        time.sleep(30)
        if model is not None and (time.monotonic() - _last_used) >= IDLE_UNLOAD_TIMEOUT_S:
            # Submitted to the same single-worker executor as generation,
            # so this can never run mid-stream — it just queues behind
            # whatever's in flight and re-checks staleness once it runs.
            _cuda_executor.submit(_maybe_unload)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lazy load by default: the model loads on the first request instead of
    # at container start, so simply starting the container no longer claims
    # VRAM — matches the on-demand `--profile tts` intent above. Set
    # EAGER_LOAD=true to restore the old always-resident-at-startup behavior.
    if EAGER_LOAD:
        await asyncio.get_running_loop().run_in_executor(_cuda_executor, _load_model)
    threading.Thread(target=_idle_checker, daemon=True, name="tts-idle-checker").start()
    yield


app = FastAPI(title="Qwen3-TTS Server (OpenAI-compatible)", lifespan=lifespan)


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
        "model_loaded": model is not None,
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
    global _last_used
    _last_used = time.monotonic()
    loop = asyncio.get_running_loop()
    if model is None:
        try:
            # _get_voice_prompt() below also touches `model` directly, so it
            # must be reloaded before we ever reach it.
            await loop.run_in_executor(_cuda_executor, _reload_if_needed)
        except Exception as e:
            raise HTTPException(503, f"Model failed to reload: {e}")

    gen_lang_code = (req.language or LANG_CODE).lower()
    language = LANG_MAP.get(gen_lang_code, "English")
    x_vector_only = _resolve_x_vector_only(req.voice, gen_lang_code)
    prompt = _get_voice_prompt(req.voice, x_vector_only)
    fmt = req.response_format.lower()
    t0 = time.monotonic()

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
        global _last_used
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
                        # Streaming WAV header: total length is unknown up
                        # front, so RIFF and data sizes use the 0xFFFFFFFF
                        # "unspecified" convention players accept for live
                        # streams (16-bit mono PCM at the model sample rate).
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
            _last_used = time.monotonic()
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
