#!/usr/bin/env python3
"""Serveur OpenAI-compatible pour Qwen3-TTS avec clonage vocal persistant."""

import io
import json
import os
import traceback
from datetime import datetime
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, field_validator, model_validator

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
VOICES_DIR = os.getenv("VOICES_DIR", "/data/voices")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/data/output")
LANG_CODE = os.getenv("LANG_CODE", "french")
CACHE_FILE = os.getenv("CACHE_FILE", "/data/voice_cache.json")
SAVE_OUTPUT = os.getenv("SAVE_OUTPUT", "true").lower() == "true"
PROMPT_CACHE_DIR = os.getenv("PROMPT_CACHE_DIR", "/data/voices")

SUPPORTED_LANGUAGES = [
    "auto", "chinese", "english", "french", "german",
    "italian", "japanese", "korean", "portuguese", "russian", "spanish",
]

app = FastAPI(title="Qwen3-TTS API")
model = None
voice_registry = {}  # name -> {"ref_audio": ..., "ref_text": ...}
prompt_cache = {}    # (ref_audio, ref_text) -> prompt


class SpeechRequest(BaseModel):
    model: str | None = MODEL_ID
    input: str | None = None   # champ OpenAI standard
    text: str | None = None    # alias courant de nombreux clients
    voice: str | None = None
    speaker: str | None = None  # alias envoye par certains clients
    language: str | None = None
    lang_code: str | None = None
    ref_audio: str | None = None
    ref_text: str | None = None
    temperature: float | None = 0.8
    top_p: float | None = 0.9
    repetition_penalty: float | None = 1.05
    max_tokens: int | None = 2048
    response_format: str | None = "wav"
    stream: bool | None = False

    class Config:
        extra = "allow"

    @model_validator(mode="after")
    def coerce_text_input(self):
        # Accepte 'text' comme alias de 'input'
        if self.input is None and self.text is not None:
            self.input = self.text
        if self.input is None:
            raise ValueError("Le champ 'input' (ou 'text') est requis")
        if self.voice is None and self.speaker is not None:
            self.voice = self.speaker
        return self

    @field_validator("language", "lang_code", mode="before")
    @classmethod
    def normalize_lang(cls, v):
        if v is None:
            return None
        v = str(v).lower().strip().replace('"', '').replace("'", '').replace('“', '').replace('”', '')
        mapping = {
            "fr": "french", "fra": "french", "fre": "french",
            "en": "english", "eng": "english",
            "de": "german", "ger": "german", "deu": "german",
            "es": "spanish", "spa": "spanish",
            "it": "italian", "ita": "italian",
            "ja": "japanese", "jpn": "japanese",
            "ko": "korean", "kor": "korean",
            "pt": "portuguese", "por": "portuguese",
            "ru": "russian", "rus": "russian",
        }
        # Gérer les codes région : "fr-fr", "en-us", etc.
        base = v.split("-")[0].split("_")[0]
        if v in mapping:
            return mapping[v]
        if base in mapping:
            return mapping[base]
        if v in SUPPORTED_LANGUAGES:
            return v
        if base in SUPPORTED_LANGUAGES:
            return base
        raise ValueError(f"Langue non supportee: {v}. Valides: {SUPPORTED_LANGUAGES}")


class VoiceRegisterRequest(BaseModel):
    model: str | None = MODEL_ID
    name: str
    ref_audio: str
    ref_text: str
    language: str | None = LANG_CODE
    x_vector_only: bool = False  # True = timbre seulement, sans transfert d'accent

    class Config:
        extra = "allow"


# ── Cache persistant sur disque ────────────────────────────────

def _save_registry():
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(voice_registry, f, ensure_ascii=False)
    except Exception:
        pass


def _load_registry():
    global voice_registry
    try:
        if os.path.exists(CACHE_FILE) and os.path.isfile(CACHE_FILE):
            with open(CACHE_FILE) as f:
                voice_registry = json.load(f)
            print(f"Cache vocal charge : {list(voice_registry.keys())}")
    except Exception:
        pass


# ── Cache NPZ des empreintes vocales ───────────────────────────

def _npz_path(name: str) -> Path:
    return Path(PROMPT_CACHE_DIR) / f"{name}.npz"


def _save_prompt_npz(name: str, prompt) -> None:
    try:
        torch.save(prompt, str(_npz_path(name)))
        print(f"Empreinte vocale sauvegardee : {name}.npz")
    except Exception as e:
        print(f"Impossible de sauvegarder {name}.npz : {e}")


def _load_prompt_npz(name: str):
    path = _npz_path(name)
    if not path.exists():
        return None
    try:
        prompt = torch.load(str(path), weights_only=False, map_location="cuda:0")
        print(f"Empreinte vocale chargee depuis {name}.npz")
        return prompt
    except Exception as e:
        print(f"Impossible de charger {name}.npz : {e}")
        return None


def _preload_prompt_cache():
    loaded = []
    for name, entry in voice_registry.items():
        cache_key = (entry["ref_audio"], entry["ref_text"], entry.get("x_vector_only", False))
        if cache_key not in prompt_cache:
            prompt = _load_prompt_npz(name)
            if prompt is not None:
                prompt_cache[cache_key] = prompt
                loaded.append(name)
    if loaded:
        print(f"Empreintes pre-chargees depuis NPZ : {loaded}")


# ── Modèle ─────────────────────────────────────────────────────

def _detect_attn():
    try:
        import flash_attn
        print(f"flash_attn {flash_attn.__version__} detecte")
        return "flash_attention_2"
    except ImportError:
        print("flash_attn absent, utilisation de sdpa")
        return "sdpa"


def load_model():
    global model
    from qwen_tts import Qwen3TTSModel

    attn = _detect_attn()
    print(f"Chargement de {MODEL_ID} (attention: {attn})...")
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation=attn,
    )
    print("Modele pret.")


def get_or_create_clone_prompt(ref_audio, ref_text, x_vector_only=False, name=None):
    cache_key = (ref_audio, ref_text, x_vector_only)
    if cache_key in prompt_cache:
        return prompt_cache[cache_key]

    if name:
        prompt = _load_prompt_npz(name)
        if prompt is not None:
            prompt_cache[cache_key] = prompt
            return prompt

    mode = "x_vector_only" if x_vector_only else "full_clone"
    print(f"Creation empreinte vocale depuis {ref_audio} (mode: {mode})...")
    prompt = model.create_voice_clone_prompt(
        ref_audio=ref_audio,
        ref_text=ref_text,
        x_vector_only_mode=x_vector_only,
    )
    prompt_cache[cache_key] = prompt

    if name:
        _save_prompt_npz(name, prompt)

    return prompt


def _resolve_voice(req: SpeechRequest):
    """Retourne (ref_audio, ref_text, x_vector_only) ou lève HTTPException."""
    if req.voice and req.voice in voice_registry:
        entry = voice_registry[req.voice]
        return entry["ref_audio"], entry["ref_text"], entry.get("x_vector_only", False)
    if req.ref_audio and req.ref_text:
        ref_audio = req.ref_audio
        if not os.path.isabs(ref_audio):
            ref_audio = os.path.join(VOICES_DIR, os.path.basename(ref_audio))
        return ref_audio, req.ref_text, False
    available = list(voice_registry.keys())
    raise HTTPException(
        400,
        f"Voix introuvable. Voix enregistrees: {available}. "
        "Enregistrez d'abord une voix via POST /v1/audio/voices, "
        "ou passez 'ref_audio'+'ref_text' dans la requete.",
    )


def _generate_raw_audio(req: SpeechRequest) -> tuple:
    """Génère l'audio et retourne (ndarray_float32, sample_rate)."""
    ref_audio, ref_text, x_vector_only = _resolve_voice(req)
    if not os.path.exists(ref_audio):
        raise HTTPException(404, f"Audio introuvable : {ref_audio}")

    prompt = get_or_create_clone_prompt(ref_audio, ref_text, x_vector_only)
    lang = req.language or req.lang_code or LANG_CODE

    try:
        wavs, sr = model.generate_voice_clone(
            text=req.input,
            language=lang,
            voice_clone_prompt=prompt,
            temperature=req.temperature or 0.8,
            top_p=req.top_p or 0.9,
            repetition_penalty=req.repetition_penalty or 1.05,
            max_new_tokens=req.max_tokens or 2048,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erreur generation : {str(e)}")

    audio = wavs[0]
    if hasattr(audio, "numpy"):
        audio = audio.cpu().numpy()
    return audio, sr


def _save_wav_output(audio, sr, req: SpeechRequest) -> None:
    if not SAVE_OUTPUT:
        return
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    buf.seek(0)
    voice_label = (req.voice or "adhoc").replace("/", "_")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = Path(OUTPUT_DIR) / f"{ts}_{voice_label}.wav"
    try:
        out_path.write_bytes(buf.read())
    except Exception:
        pass


def _generate_wav_bytes(req: SpeechRequest) -> tuple[bytes, int]:
    """Génère l'audio et retourne (wav_bytes, sample_rate)."""
    audio, sr = _generate_raw_audio(req)
    _save_wav_output(audio, sr, req)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    buf.seek(0)
    return buf.read(), sr


def _generate_pcm_bytes(req: SpeechRequest) -> tuple[bytes, int]:
    """Génère l'audio et retourne (pcm_int16_le_bytes, sample_rate)."""
    audio, sr = _generate_raw_audio(req)
    _save_wav_output(audio, sr, req)
    pcm = (audio * 32767).clip(-32768, 32767).astype(np.int16)
    return pcm.tobytes(), sr


# ── Endpoints ──────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID, "voices": list(voice_registry.keys())}


@app.get("/v1/models")
def list_models():
    return {"object": "list", "data": [{"id": MODEL_ID, "object": "model"}]}


@app.get("/v1/audio/voices")
def list_voices():
    return {"voices": [{"name": n, "npz_cached": _npz_path(n).exists()} for n in voice_registry]}


@app.post("/v1/audio/voices")
def register_voice(req: VoiceRegisterRequest):
    path = req.ref_audio
    if not os.path.isabs(path):
        path = os.path.join(VOICES_DIR, os.path.basename(path))
    if not os.path.exists(path):
        raise HTTPException(404, f"Fichier audio introuvable : {path}")

    get_or_create_clone_prompt(path, req.ref_text, req.x_vector_only, name=req.name)
    voice_registry[req.name] = {
        "ref_audio": path,
        "ref_text": req.ref_text,
        "x_vector_only": req.x_vector_only,
    }
    _save_registry()
    return {"name": req.name, "status": "registered", "x_vector_only": req.x_vector_only}


@app.post("/v1/audio/speech")
def generate_speech(req: SpeechRequest):
    if model is None:
        raise HTTPException(503, "Modele pas encore charge")

    wav_bytes, sr = _generate_wav_bytes(req)
    fmt = (req.response_format or "wav").lower()

    if fmt not in ("wav", "mp3"):
        # Ré-encoder pour FLAC/OGG via soundfile
        buf_in = io.BytesIO(wav_bytes)
        audio_data, sr = sf.read(buf_in)
        buf_out = io.BytesIO()
        sf.write(buf_out, audio_data, sr, format=fmt.upper())
        buf_out.seek(0)
        wav_bytes = buf_out.read()

    mime = {
        "wav": "audio/wav", "mp3": "audio/mpeg",
        "flac": "audio/flac", "ogg": "audio/ogg",
    }
    return Response(wav_bytes, media_type=mime.get(fmt, "audio/wav"))


# ── Streaming ──────────────────────────────────────────────────

def _stream_wav_bytes(wav_bytes: bytes, chunk_size: int = 8192):
    for i in range(0, len(wav_bytes), chunk_size):
        yield wav_bytes[i:i + chunk_size]


@app.post("/v1/audio/speech/stream")
def generate_speech_stream(req: SpeechRequest):
    if model is None:
        raise HTTPException(503, "Modele pas encore charge")

    wav_bytes, _ = _generate_wav_bytes(req)
    return StreamingResponse(_stream_wav_bytes(wav_bytes), media_type="audio/wav")


@app.post("/v1/tts/stream")
def generate_tts_stream(req: SpeechRequest):
    if model is None:
        raise HTTPException(503, "Modele pas encore charge")
    pcm_bytes, _ = _generate_pcm_bytes(req)
    return StreamingResponse(_stream_wav_bytes(pcm_bytes), media_type="application/octet-stream")


# ── Démarrage ──────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    _load_registry()
    load_model()
    _preload_prompt_cache()
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    print(f"API prete sur le port 8080. Voix enregistrees: {list(voice_registry.keys())}")
