FROM python:3.12-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq ffmpeg curl && rm -rf /var/lib/apt/lists/*

# CPU-only wheel: this service only ever runs Silero VAD (a few MB model),
# never an LLM/STT/TTS model — those stay in the app's configured STT/TTS
# servers, called back over HTTP. No CUDA image needed here.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
