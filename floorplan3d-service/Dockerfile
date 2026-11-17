# Hugging Face Spaces (Docker SDK) — also runs anywhere Docker runs.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Spaces run the container as user 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

# PyTorch CPU build (much smaller than the default CUDA build)
RUN pip install --no-cache-dir --user torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# CubiCasa5K model code (pinned) + pretrained weights (209 MB, official release on Google Drive)
RUN git clone https://github.com/Aswi-ni/CubicasaRoomSegmentation.git cubicasa \
    && git -C cubicasa checkout e9e0cb6db9a970da456a32689dec65e76308c9c1
RUN mkdir -p weights && python -c "import gdown; gdown.download(id='1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK', output='weights/cubicasa5k.pkl', quiet=False)" \
    && test -s weights/cubicasa5k.pkl

COPY --chown=user app.py roomfit_3d.py product_details.py ./

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
