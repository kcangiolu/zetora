ARG CUDA_IMAGE=nvidia/cuda:13.1.2-devel-ubuntu24.04
FROM ${CUDA_IMAGE}

# Trois variables ajustables selon l'environnement de build :
#   TORCH_CUDA_ARCH_LIST : compute capability cible (ex: "8.6" pour RTX 3000,
#                          "12.0" pour RTX 5000, "8.6;12.0" pour les deux)
#   TORCH_CUDA_BUILD     : suffixe de l'index PyTorch (cu130, cu124, ...)
#   TORCH_VERSION        : version de torch à installer
ARG TORCH_CUDA_ARCH_LIST=8.6
ARG TORCH_CUDA_BUILD=cu130
ARG TORCH_VERSION=2.12.1

RUN apt-get update -qq && \
    apt-get install -y -qq \
      python3 python3-pip python3-venv \
      ffmpeg curl sox libsox-dev \
      ninja-build git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --quiet --upgrade pip setuptools wheel packaging ninja

RUN /opt/venv/bin/pip install --quiet \
    torch==${TORCH_VERSION} torchaudio \
    --index-url https://download.pytorch.org/whl/${TORCH_CUDA_BUILD}

# Compilation flash-attn pour l'architecture cible
# FLASH_ATTENTION_FORCE_BUILD=TRUE évite que pip cherche un wheel PyPI inexistant
RUN MAX_JOBS=1 \
    NVCC_PREPEND_FLAGS='--threads 1' \
    FLASH_ATTENTION_FORCE_BUILD=TRUE \
    TORCH_CUDA_ARCH_LIST=${TORCH_CUDA_ARCH_LIST} \
    /opt/venv/bin/pip install flash-attn --no-build-isolation

RUN /opt/venv/bin/pip install --quiet qwen-tts fastapi uvicorn

COPY server.py .

CMD ["/opt/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
