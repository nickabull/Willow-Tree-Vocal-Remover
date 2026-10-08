FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7860
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# Prefer CPU-only PyTorch builds to avoid downloading GPU CUDA dependencies.
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN useradd -m -u 10001 willow && mkdir -p /tmp/willow-cpu-jobs && chown willow:willow /tmp/willow-cpu-jobs
USER willow
EXPOSE 7860
CMD ["python", "app.py"]
