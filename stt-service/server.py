"""
Local STT backend for Zetora's Voice/dictation features — NVIDIA Parakeet TDT
0.6B v3 via transformers, replacing the previous Whisper/faster-whisper-server
setup.

Parakeet TDT runs on plain PyTorch (no NeMo toolkit, no flash-attention), so it
reuses the exact torch/CUDA wheels already proven on both the RTX 3090 and RTX
5060 Ti for qwen3-tts — avoiding the CTranslate2 Blackwell (sm_120) fallback
that made faster-whisper-server's CUDA image pathologically slow (100s+ for a
3s clip) on the 5060 Ti. It's also smaller (0.6B vs Whisper medium's 0.77B),
multilingual with automatic language detection (25 European languages
including French, ~5% WER), and designed for low-latency use.

Exposes the same OpenAI-compatible /v1/audio/transcriptions contract the
previous whisper-stt service did, so no app-side config changes are needed —
existing custom-provider baseURLs pointing at this host:port keep working.
"""

import asyncio
import gc
import logging
import os
import tempfile
import threading
import time

import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from transformers import pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("stt-service")

MODEL_ID = os.getenv("MODEL_ID", "nvidia/parakeet-tdt-0.6b-v3")

# GPU is shared with other services on the box (Ollama, ComfyUI, ...) and
# stays scarce even at idle — unload the model after 5 minutes of inactivity
# instead of holding VRAM hostage between requests.
IDLE_UNLOAD_TIMEOUT_S = 300

# Default is lazy-load (model loads on first request). Set to reclaim the old
# always-resident behavior, e.g. when the GPU is dedicated to this service.
EAGER_LOAD = os.getenv("EAGER_LOAD", "false").lower() == "true"
# EAGER_LOAD only affects *when* the model first loads — the 5min idle-unload
# below still applies regardless. Set this to keep the model resident forever
# once loaded (e.g. GPU fully dedicated to this service, no VRAM to reclaim).
DISABLE_IDLE_UNLOAD = os.getenv("DISABLE_IDLE_UNLOAD", "false").lower() == "true"

asr_pipeline = None
device_label = "unknown"
_last_used = time.monotonic()
_active_requests = 0
_load_lock = asyncio.Lock()


def _load_model() -> None:
    global asr_pipeline, device_label

    if torch.cuda.is_available():
        try:
            pipe = pipeline("automatic-speech-recognition", model=MODEL_ID, device=0, torch_dtype=torch.float16)
            # Probe with real inference at startup, not just a device check —
            # this is what actually caught faster-whisper-server's silent slow
            # fallback on the 5060 Ti. PyTorch's failure mode for an
            # unsupported arch is a clean exception, not a silent slow path,
            # so a bad GPU here fails fast rather than hanging.
            pipe({"raw": np.zeros(1600, dtype=np.float32), "sampling_rate": 16000})
            asr_pipeline = pipe
            device_label = "cuda"
            logger.info("Parakeet TDT (%s) loaded on GPU (float16)", MODEL_ID)
            return
        except Exception:
            logger.exception("GPU load/probe failed, falling back to CPU")

    asr_pipeline = pipeline("automatic-speech-recognition", model=MODEL_ID, device=-1, torch_dtype=torch.float32)
    device_label = "cpu"
    logger.info("Parakeet TDT (%s) loaded on CPU", MODEL_ID)


def _unload_model() -> None:
    global asr_pipeline
    # Never unload out from under an in-flight transcription — this runs on
    # a plain background thread, not serialized with request handling like
    # tts-service's dedicated CUDA-thread executor.
    if asr_pipeline is None or _active_requests > 0:
        return
    logger.info("Idle for %ds — unloading Parakeet model to free VRAM", IDLE_UNLOAD_TIMEOUT_S)
    asr_pipeline = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()
    logger.info("STT model unloaded, GPU memory freed")


def _idle_checker() -> None:
    while True:
        time.sleep(30)
        if (
            asr_pipeline is not None
            and _active_requests == 0
            and (time.monotonic() - _last_used) >= IDLE_UNLOAD_TIMEOUT_S
        ):
            _unload_model()


async def _ensure_loaded(loop: asyncio.AbstractEventLoop) -> None:
    if asr_pipeline is not None:
        return
    async with _load_lock:
        if asr_pipeline is None:  # re-check: another request may have loaded it while we waited
            await loop.run_in_executor(None, _load_model)


app = FastAPI(title="Zetora STT (Parakeet TDT)")


@app.on_event("startup")
async def _startup() -> None:
    if EAGER_LOAD:
        await asyncio.get_event_loop().run_in_executor(None, _load_model)
    if not DISABLE_IDLE_UNLOAD:
        threading.Thread(target=_idle_checker, daemon=True, name="stt-idle-checker").start()


@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "model": MODEL_ID,
        "model_loaded": asr_pipeline is not None,
        "device": device_label,
    })


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model: str = Form(None)):
    data = await file.read()
    if not data:
        return JSONResponse({"text": ""})

    global _last_used, _active_requests
    loop = asyncio.get_event_loop()
    _last_used = time.monotonic()
    _active_requests += 1
    try:
        await _ensure_loaded(loop)

        suffix = os.path.splitext(file.filename or "")[1] or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(data)
            tmp.flush()
            result = await loop.run_in_executor(None, asr_pipeline, tmp.name)
    finally:
        _active_requests -= 1
        _last_used = time.monotonic()

    return JSONResponse({"text": (result.get("text") or "").strip()})
