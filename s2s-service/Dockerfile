FROM python:3.12-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq ffmpeg curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Silero VAD's raw ONNX graph, run directly via onnxruntime (no torch): this
# service only ever runs VAD (a few MB model) — never an LLM/STT/TTS model,
# those stay in the app's configured STT/TTS servers, called back over HTTP.
# Pinned to a commit + verified checksum so the build is reproducible and a
# silently-changed upstream file fails the build instead of shipping unnoticed.
ARG SILERO_VAD_COMMIT=bfdc0193023f121ea5b3cc7b176dbed570a68a59
ARG SILERO_VAD_SHA256=1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3
RUN curl -fsSL -o silero_vad.onnx \
      "https://raw.githubusercontent.com/snakers4/silero-vad/${SILERO_VAD_COMMIT}/src/silero_vad/data/silero_vad.onnx" && \
    echo "${SILERO_VAD_SHA256}  silero_vad.onnx" | sha256sum -c -

COPY server.py .

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
