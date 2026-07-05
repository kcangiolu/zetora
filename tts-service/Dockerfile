ARG CUDA_IMAGE=nvidia/cuda:13.1.2-runtime-ubuntu24.04
FROM ${CUDA_IMAGE}

ARG TORCH_CUDA_BUILD=cu130
ARG TORCH_VERSION=2.9.1

# flash-attn strategy (see docker-compose build.args / .env):
#   prebuilt : install the pre-compiled wheel below — covers sm_80/86/89/90/100/120,
#              i.e. RTX 3090 (sm_86, via the sm_80 cubin) and RTX 5060 Ti (sm_120).
#   compile  : build from source for FLASH_ATTN_ARCH_LIST — for hardware the wheel
#              misses. REQUIRES a -devel base (set CUDA_IMAGE=...-devel...) for nvcc.
#   none     : skip flash-attn entirely; server.py falls back to SDPA (no crash).
# Regardless of mode, server.py probes a real kernel at startup and uses SDPA if
# flash-attn is absent or unusable on the running GPU — so the image never crashes.
ARG FLASH_ATTN_MODE=prebuilt
ARG FLASH_ATTN_WHEEL=https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.6.8/flash_attn-2.8.3%2Bcu130torch2.9-cp312-cp312-linux_x86_64.whl
ARG FLASH_ATTN_VERSION=2.8.3
ARG FLASH_ATTN_ARCH_LIST=8.0;8.6;8.9;9.0;10.0;12.0

RUN apt-get update -qq && \
    apt-get install -y -qq \
      python3 python3-pip python3-venv \
      ffmpeg curl sox libsox-fmt-all git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --quiet --upgrade pip setuptools wheel packaging ninja

RUN /opt/venv/bin/pip install --quiet \
    torch==${TORCH_VERSION} torchaudio==${TORCH_VERSION} \
    --index-url https://download.pytorch.org/whl/${TORCH_CUDA_BUILD}

# Flash-attn: prebuilt wheel (default), compiled from source, or skipped.
RUN set -e; \
    case "$FLASH_ATTN_MODE" in \
      prebuilt) \
        echo "flash-attn: installing prebuilt wheel"; \
        /opt/venv/bin/pip install --quiet "$FLASH_ATTN_WHEEL" ;; \
      compile) \
        echo "flash-attn: compiling $FLASH_ATTN_VERSION from source for [$FLASH_ATTN_ARCH_LIST]"; \
        command -v nvcc >/dev/null 2>&1 || { \
          echo "ERROR: FLASH_ATTN_MODE=compile needs nvcc — rebuild with CUDA_IMAGE=nvidia/cuda:13.1.2-devel-ubuntu24.04"; \
          exit 1; }; \
        TORCH_CUDA_ARCH_LIST="$FLASH_ATTN_ARCH_LIST" MAX_JOBS="${MAX_JOBS:-4}" \
          /opt/venv/bin/pip install --quiet --no-build-isolation "flash-attn==$FLASH_ATTN_VERSION" ;; \
      none) \
        echo "flash-attn: disabled — server.py will use SDPA" ;; \
      *) \
        echo "ERROR: unknown FLASH_ATTN_MODE='$FLASH_ATTN_MODE' (expected prebuilt|compile|none)"; \
        exit 1 ;; \
    esac

# Fork rekuenkdr/Qwen3-TTS-streaming (true streaming with CUDA graphs),
# pinned to a commit so builds are reproducible. The two sed patches adapt it
# to transformers 4.57 (@check_model_inputs decorator without parentheses,
# tolerant pad_token_id lookup); each patch is verified so a silent sed no-op
# on a changed upstream fails the build instead of shipping broken code.
ARG QWEN3_TTS_STREAMING_COMMIT=b8db6ff1cebc0d6554cf0977045850bcc796b383
RUN git clone --quiet https://github.com/rekuenkdr/Qwen3-TTS-streaming /tmp/qwen3-tts-streaming && \
    git -C /tmp/qwen3-tts-streaming checkout --quiet "$QWEN3_TTS_STREAMING_COMMIT" && \
    sed -i 's/@check_model_inputs()/@check_model_inputs/g' \
      /tmp/qwen3-tts-streaming/qwen_tts/core/tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py && \
    grep -q '@check_model_inputs$' \
      /tmp/qwen3-tts-streaming/qwen_tts/core/tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py && \
    sed -i 's/self\.padding_idx = config\.pad_token_id/self.padding_idx = getattr(config, "pad_token_id", None)/g' \
      /tmp/qwen3-tts-streaming/qwen_tts/core/models/modeling_qwen3_tts.py && \
    grep -q 'getattr(config, "pad_token_id", None)' \
      /tmp/qwen3-tts-streaming/qwen_tts/core/models/modeling_qwen3_tts.py && \
    cd /tmp/qwen3-tts-streaming && /opt/venv/bin/pip install --quiet . && \
    /opt/venv/bin/pip install --quiet 'transformers==4.57.6'

# Web layer pinned via requirements.lock (uv pip compile requirements.txt)
COPY requirements.lock .
RUN /opt/venv/bin/pip install --quiet -r requirements.lock

# WSL2: torch.compile/Triton links its runtime kernel helper with `-lcuda`, but
# WSL exposes only a versioned libcuda.so.1 (no unversioned libcuda.so), so the
# link fails. The CUDA base ships an unversioned libcuda.so in compat/; pointing
# the compile-time linker there fixes it. Runtime dlopen still resolves the real
# driver via ldconfig, so no version mixing. No-op on native Linux (prod).
ENV LIBRARY_PATH=/usr/local/cuda/compat

COPY server.py .

HEALTHCHECK --interval=30s --timeout=10s --start-period=10m --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["/opt/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
