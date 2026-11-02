---
title: RoomFit 3D
emoji: 🏠
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# RoomFit floor plan service

CubiCasa5K floor plan recognition + 3D model generation for the RoomFit app.

- `POST /api/floorplan/segment`: rooms as polygons. The app's upload step uses this to detect rooms.
- `POST /api/floorplan/3d`: 3D model (`.glb`, base64) plus rooms, doors and windows in metres. Used by the "View in 3D" page.
- `GET /api/`: health check. `GET /docs` shows interactive API docs.

## 最简单：在自己的 Mac 上运行

打开「终端」，运行 `bash start_server_mac.command`（在这个文件夹里）。第一次会自动安装组件（几分钟），之后几秒就能启动。窗口里会显示要填进 `frontend/.env` 的地址。电脑要开着，手机和电脑要连同一个 Wi-Fi。

## 免费方案：用 Google Colab 当服务器

打开 `RoomFit_Server_Colab.ipynb`，上传到 Colab，选 T4 GPU，点「全部运行」。最后一个格子会给出一个网址，按提示填进 `frontend/.env`。Colab 页面要一直开着；重新运行后网址会变。

## 部署到 Hugging Face Spaces（长期运行）

1. 注册并登录 [huggingface.co](https://huggingface.co)。
2. 点右上角头像 → **New Space**：
   - **Space name**：`roomfit-3d`
   - **SDK**：选 **Docker** → **Blank**
   - **Hardware**：免费的 **CPU basic**
   - **Visibility**：选 **Public**（App 要能直接访问它）
3. 创建后进入 Space 的 **Files** 页面 → **Add file → Upload files**，把这个文件夹里的 5 个文件拖进去：
   `README.md`、`Dockerfile`、`requirements.txt`、`app.py`、`roomfit_3d.py`，点 **Commit**。
4. Space 会自动开始构建，大约 5 到 10 分钟。顶部状态从 **Building** 变成 **Running** 就好了。
5. 服务器地址是：`https://<你的用户名>-roomfit-3d.hf.space`
   在浏览器打开 `https://<你的用户名>-roomfit-3d.hf.space/api/`，看到 `{"ok":true,...}` 就说明成功了。

## 让 App 连上服务器

在 `frontend` 文件夹里新建一个名为 `.env` 的文件，写一行（换成你的地址）：

```
EXPO_PUBLIC_BACKEND_URL=https://<你的用户名>-roomfit-3d.hf.space
```

然后重新启动 Expo：`npx expo start --tunnel`，手机用 Expo Go 扫码。

## 注意

- 免费服务器闲置约 48 小时后会休眠，下次访问要等 1 分钟左右唤醒；第一次生成 3D 也会比较慢（加载模型）。演示或录视频前，先打开一次 `/api/` 地址把它叫醒。
- 公寓面积（sq ft）决定 3D 模型的真实尺寸；没填的话按门宽约 0.85 米估算。
- 识别效果最好的是清晰的线稿户型图。风格化、墙线很浅的户型图可能只识别出一部分，需要用户在 App 的房间编辑步骤里修正。

## 本地运行（可选）

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
git clone https://github.com/Aswi-ni/CubicasaRoomSegmentation.git cubicasa
mkdir -p weights && python -c "import gdown; gdown.download(id='1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK', output='weights/cubicasa5k.pkl')"
uvicorn app:app --port 8001
```
