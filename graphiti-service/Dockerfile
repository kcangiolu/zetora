FROM python:3.12-slim

WORKDIR /app
# requirements.lock is compiled from requirements.txt via `uv pip compile`
# for reproducible builds; regenerate it when bumping dependencies.
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY config.py client.py helpers.py main.py ./

# Deliberately kept root: /data is a host bind mount (${DATA_DIR}/graphiti)
# whose ownership the image can't control; a fixed non-root uid would break
# POST /config persistence on existing deployments.
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8001')+'/health', timeout=4)"
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"
