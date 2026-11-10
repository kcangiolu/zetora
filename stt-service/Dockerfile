# The base's CUDA major.minor must match TORCH_CUDA_BUILD (cu130 = 13.0):
# torch's cu130 wheels run on any NVIDIA driver from 580 on, and a newer base
# only raises that floor without being used.
ARG CUDA_IMAGE=nvidia/cuda:13.0.3-runtime-ubuntu24.04
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

# Web layer pinned via requirements.lock (uv pip compile requirements.txt -o requirements.lock --python-version 3.12)
COPY requirements.lock .
RUN /opt/venv/bin/pip install --quiet -r requirements.lock

# The CUDA base ships a forward-compatibility libcuda in compat/. The NVIDIA
# Container Toolkit puts it ahead of the host driver whenever the host driver
# is older than it, and it only works on datacenter GPUs: on a GeForce card
# CUDA then fails to initialize. Removing it makes the container always use
# the host driver.
# WSL2: torch.compile/Triton links its runtime kernel helper with `-lcuda`, but
# WSL exposes only a versioned libcuda.so.1, so an unversioned copy is kept for
# the compile-time linker alone. Its SONAME is libcuda.so.1, so the loader
# still resolves the host driver at runtime.
RUN mkdir -p /opt/cuda-link && \
    cp -L /usr/local/cuda/compat/libcuda.so /opt/cuda-link/libcuda.so && \
    rm -rf /usr/local/cuda/compat
ENV LIBRARY_PATH=/opt/cuda-link

COPY server.py .

EXPOSE 8080
# Generous start-period: first boot downloads the ~1.1GB checkpoint plus the
# GPU probe inference.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["/opt/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
