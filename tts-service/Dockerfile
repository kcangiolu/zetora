ARG CUDA_IMAGE=nvidia/cuda:13.1.2-devel-ubuntu24.04
FROM ${CUDA_IMAGE}

ARG TORCH_CUDA_BUILD=cu130
ARG TORCH_VERSION=2.9.1

RUN apt-get update -qq && \
    apt-get install -y -qq \
      python3 python3-pip python3-venv \
      ffmpeg curl sox libsox-fmt-all \
      ninja-build git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --quiet --upgrade pip setuptools wheel packaging ninja

RUN /opt/venv/bin/pip install --quiet \
    torch==${TORCH_VERSION} torchaudio \
    --index-url https://download.pytorch.org/whl/${TORCH_CUDA_BUILD}

# Flash-attn depuis wheel pré-compilé (cu130 + torch 2.9, Python 3.12, Linux x86_64)
RUN /opt/venv/bin/pip install --quiet \
    'https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.6.8/flash_attn-2.8.3%2Bcu130torch2.9-cp312-cp312-linux_x86_64.whl'

# Fork rekuenkdr/Qwen3-TTS-streaming (streaming réel avec CUDA graphs)
# Le décorateur @check_model_inputs() doit être sans parenthèses dans ce fork
RUN git clone --quiet https://github.com/rekuenkdr/Qwen3-TTS-streaming /tmp/qwen3-tts-streaming && \
    sed -i 's/@check_model_inputs()/@check_model_inputs/g' \
      /tmp/qwen3-tts-streaming/qwen_tts/core/tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py && \
    cd /tmp/qwen3-tts-streaming && /opt/venv/bin/pip install --quiet .

RUN /opt/venv/bin/pip install --quiet fastapi uvicorn

COPY server.py .

CMD ["/opt/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
