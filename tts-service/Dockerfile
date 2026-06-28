FROM nvidia/cuda:13.1.2-devel-ubuntu24.04

# Dépendances système installées au build — évite l'apt-get au démarrage
RUN apt-get update -qq && \
    apt-get install -y -qq \
      python3 python3-pip python3-venv \
      ffmpeg curl sox libsox-dev \
      ninja-build git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py .

# Le venv (torch, flash-attn, qwen-tts…) est créé au premier démarrage
# dans /opt/venv (monté sur DATA_DIR/qwen3-tts/venv) par le command du compose,
# après détection de la compute capability GPU.
CMD ["bash"]
