ARG CUDA_IMAGE=nvidia/cuda:13.1.2-runtime-ubuntu24.04
FROM ${CUDA_IMAGE}

ARG TORCH_CUDA_BUILD=cu130
ARG TORCH_VERSION=2.9.1
# Parakeet needs a build with ParakeetForTDT (added 2025-09-25); tts-service's
# 4.57.6 pin predates that (it's specific to its own Qwen3-TTS fork), so this
# is pinned independently.
ARG TRANSFORMERS_VERSION=5.13.0

RUN apt-get update -qq && \
    apt-get install -y -qq python3 python3-pip python3-venv ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --quiet --upgrade pip

# Parakeet TDT is plain PyTorch — no NeMo toolkit, no flash-attention — so it
# needs nothing beyond these two wheels for GPU inference.
RUN /opt/venv/bin/pip install --quiet \
    torch==${TORCH_VERSION} \
    --index-url https://download.pytorch.org/whl/${TORCH_CUDA_BUILD}

RUN /opt/venv/bin/pip install --quiet "transformers==${TRANSFORMERS_VERSION}"

COPY requirements.txt .
RUN /opt/venv/bin/pip install --quiet -r requirements.txt

# WSL2: torch.compile/Triton links its runtime kernel helper with `-lcuda`, but
# WSL exposes only a versioned libcuda.so.1 (no unversioned libcuda.so), so the
# link fails. The CUDA base ships an unversioned libcuda.so in compat/; pointing
# the compile-time linker there fixes it. No-op on native Linux (prod).
ENV LIBRARY_PATH=/usr/local/cuda/compat

COPY server.py .

EXPOSE 8080
# Generous start-period: first boot downloads the ~1.1GB checkpoint plus the
# GPU probe inference.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["/opt/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
