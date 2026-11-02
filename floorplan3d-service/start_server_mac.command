#!/bin/bash
# RoomFit floor plan server — run it on your own Mac (no Colab needed).
# Start it from Terminal:  bash start_server_mac.command
# The first run installs everything (about 5 minutes). Later runs start in seconds.

cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo " RoomFit 户型识别 + 3D 服务器（本机版）"
echo "=============================================="

# 1. Python
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ 没有找到 Python。请先安装：https://www.python.org/downloads/ （下载 macOS 版本，像普通软件一样安装）"
  read -r -p "按回车键退出" _; exit 1
fi
echo "✓ Python: $(python3 --version)"

# 2. Private environment for this server (does not affect anything else on your Mac)
if [ ! -d .venv ]; then
  echo "→ 第一次运行：创建运行环境…"
  python3 -m venv .venv || { echo "❌ 创建环境失败"; read -r -p "按回车键退出" _; exit 1; }
fi
# shellcheck disable=SC1091
source .venv/bin/activate

if [ ! -f .venv/.installed ]; then
  echo "→ 第一次运行：安装组件（PyTorch 等，约几百 MB，请耐心等几分钟）…"
  python -m pip install -q --upgrade pip
  python -m pip install -q torch torchvision fastapi uvicorn numpy opencv-python-headless scipy \
      scikit-image shapely trimesh mapbox-earcut pillow tqdm gdown \
    && touch .venv/.installed \
    || { echo "❌ 安装失败，请把上面的报错截图发给 Claude"; read -r -p "按回车键退出" _; exit 1; }
fi
echo "✓ 组件已安装"

# 3. CubiCasa5K model code (same project your Colab notebook used)
if [ ! -f cubicasa/model/segmentation_net.py ]; then
  echo "→ 下载 CubiCasa5K 模型代码…"
  COMMIT=e9e0cb6db9a970da456a32689dec65e76308c9c1
  rm -rf cubicasa
  if ! { curl -fsSL -o cubicasa.zip "https://github.com/Aswi-ni/CubicasaRoomSegmentation/archive/${COMMIT}.zip" \
         && unzip -q -o cubicasa.zip && mv "CubicasaRoomSegmentation-${COMMIT}" cubicasa; }; then
    git clone -q https://github.com/Aswi-ni/CubicasaRoomSegmentation.git cubicasa 2>/dev/null \
      || { echo "❌ 下载模型代码失败，请检查网络"; read -r -p "按回车键退出" _; exit 1; }
  fi
  rm -f cubicasa.zip
fi
echo "✓ 模型代码已就绪"

# 4. Model weights: reuse the file you already downloaded, otherwise download it
mkdir -p weights
if [ ! -s weights/cubicasa5k.pkl ]; then
  for f in "$HOME/Downloads/model_best_val_loss_var.pkl" "$HOME/Downloads/cubicasa5k.pkl" "./model_best_val_loss_var.pkl"; do
    if [ -s "$f" ]; then echo "→ 使用已下载的模型文件：$f"; cp "$f" weights/cubicasa5k.pkl; break; fi
  done
fi
if [ ! -s weights/cubicasa5k.pkl ]; then
  echo "→ 下载模型权重（209 MB）…"
  python -c "import gdown; gdown.download(id='1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK', output='weights/cubicasa5k.pkl', quiet=False)"
fi
if [ ! -s weights/cubicasa5k.pkl ]; then
  echo "❌ 没有模型文件。请在浏览器下载 https://drive.google.com/file/d/1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK/view 到「下载」文件夹后重新运行"
  read -r -p "按回车键退出" _; exit 1
fi
echo "✓ 模型权重已就绪"

# 5. Addresses for the app
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "=============================================="
echo " 服务器启动中…（看到 Uvicorn running 就好了）"
echo ""
echo " 把下面这一行写进 RoomFit-APP/frontend/.env ："
echo ""
if [ -n "$IP" ]; then
  echo "   手机 + 电脑都能用（同一个 Wi-Fi）："
  echo "   EXPO_PUBLIC_BACKEND_URL=http://${IP}:8001"
  echo ""
fi
echo "   只在这台电脑的浏览器里预览："
echo "   EXPO_PUBLIC_BACKEND_URL=http://localhost:8001"
echo ""
echo " 测试：浏览器打开 http://localhost:8001/api/"
echo " 如果 Mac 弹窗问是否允许传入连接，点「允许」。"
echo " 用的时候不要关这个窗口；按 Ctrl+C 停止服务器。"
echo "=============================================="
echo ""

export CUBICASA_CHECKPOINT=weights/cubicasa5k.pkl CUBICASA_REPO=cubicasa
exec python -m uvicorn app:app --host 0.0.0.0 --port 8001
