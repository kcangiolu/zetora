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
import logging
import os
import tempfile

import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from transformers import pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("stt-service")

MODEL_ID = os.getenv("MODEL_ID", "nvidia/parakeet-tdt-0.6b-v3")

asr_pipeline = None
device_label = "unknown"


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


app = FastAPI(title="Zetora STT (Parakeet TDT)")


@app.on_event("startup")
async def _startup() -> None:
    await asyncio.get_event_loop().run_in_executor(None, _load_model)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "model": MODEL_ID, "device": device_label})


@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model: str = Form(None)):
    data = await file.read()
    if not data:
        return JSONResponse({"text": ""})

    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(data)
        tmp.flush()
        result = await asyncio.get_event_loop().run_in_executor(None, asr_pipeline, tmp.name)

    return JSONResponse({"text": (result.get("text") or "").strip()})
