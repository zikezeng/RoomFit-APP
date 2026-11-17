"""
RoomFit floor plan service (CubiCasa5K recognition + 3D model).

Runs on Hugging Face Spaces (Docker) or any machine with Python. The RoomFit app points
EXPO_PUBLIC_BACKEND_URL at this server.

Routes (all under /api, like the original RoomFit backend):
  GET  /api/                   health check
  POST /api/floorplan/segment  rooms as polygons (0-1000 normalised) — same shape the app's
                               upload step already uses, so it replaces the old OpenCV endpoint
  POST /api/floorplan/3d       3D model (.glb, base64) + rooms/doors/windows in metres
"""

import base64
import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import cv2
import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from roomfit_3d import Recognizer, Settings, build_scene, extract_geometry, geometry_to_json

ROOT = Path(__file__).parent
CHECKPOINT = os.environ.get("CUBICASA_CHECKPOINT", str(ROOT / "weights" / "cubicasa5k.pkl"))
REPO_DIR = os.environ.get("CUBICASA_REPO", str(ROOT / "cubicasa"))
MAX_IMAGE_BYTES = 12 * 1024 * 1024

app = FastAPI(title="RoomFit floor plan service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api = APIRouter(prefix="/api")

_recognizer = None
_lock = threading.Lock()          # one inference at a time (CPU box)
_cache: "OrderedDict[str, tuple]" = OrderedDict()  # image hash -> (room_mask, icon_mask)


_load_lock = threading.Lock()


def recognizer() -> Recognizer:
    global _recognizer
    with _load_lock:  # the startup warm-up and the first request must not load it twice
        if _recognizer is None:
            _recognizer = Recognizer(CHECKPOINT, REPO_DIR)
    return _recognizer


def decode_image(image_base64: str) -> tuple[np.ndarray, str]:
    raw = image_base64.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(400, "image_base64 is not valid base64")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large (max 12 MB)")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not read the image. Use a JPG or PNG floor plan.")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB), hashlib.sha1(data).hexdigest()


def masks_for(rgb: np.ndarray, key: str):
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        masks = recognizer().predict(rgb)
        _cache[key] = masks
        while len(_cache) > 8:
            _cache.popitem(last=False)
        return masks


class ImageIn(BaseModel):
    image_base64: str


class Model3DIn(ImageIn):
    sqft: float | None = Field(None, gt=50, lt=20000, description="apartment size; sets real-world scale")
    wall_height: float = Field(2.7, ge=2.0, le=5.0, description="ceiling height in metres")


@api.get("/")
def health():
    return {
        "ok": True,
        "model_loaded": _recognizer is not None,
        "shopping_configured": bool(os.environ.get("SERPAPI_KEY")),
    }


@api.get("/products/search")
def product_search(q: str, limit: int = 8):
    """Search live US shopping listings without exposing the SerpAPI key to the app."""
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(400, "Search query is too short.")
    limit = max(1, min(limit, 12))

    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        raise HTTPException(
            503,
            "Real shopping search is not configured. Add SERPAPI_KEY to floorplan3d-service/.env and restart the server.",
        )

    params = urlencode({
        "engine": "google_shopping_light",
        "q": query,
        "gl": "us",
        "hl": "en",
        "api_key": api_key,
    })
    req = Request(
        f"https://serpapi.com/search.json?{params}",
        headers={"User-Agent": "RoomFit/1.0"},
    )
    try:
        with urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        raise HTTPException(502, f"Shopping provider returned HTTP {e.code}.")
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise HTTPException(502, "Could not reach the shopping provider.")

    if payload.get("error"):
        raise HTTPException(502, str(payload["error"]))

    rows = [
        *payload.get("inline_shopping_results", []),
        *payload.get("shopping_results", []),
    ]
    products = []
    seen = set()
    for row in rows:
        title = str(row.get("title") or "").strip()
        retailer = str(row.get("source") or "").strip()
        direct_url = row.get("link")
        url = direct_url or row.get("product_link")
        if not title or not url:
            continue

        dedupe = (title.lower(), retailer.lower())
        if dedupe in seen:
            continue
        seen.add(dedupe)

        price = row.get("extracted_price")
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None

        products.append({
            "id": str(row.get("product_id") or hashlib.sha1(str(url).encode()).hexdigest()[:16]),
            "title": title,
            "price": price,
            "price_text": row.get("price"),
            "retailer": retailer or "Google Shopping",
            "url": str(url),
            "image": row.get("thumbnail") or row.get("serpapi_thumbnail"),
            "rating": row.get("rating"),
            "reviews": row.get("reviews"),
            "delivery": row.get("delivery"),
            "direct_retailer": bool(direct_url),
        })
        if len(products) >= limit:
            break

    return {
        "query": query,
        "provider": "SerpAPI Google Shopping",
        "products": products,
    }


@app.get("/")
def root():
    return {"service": "RoomFit floor plan service", "docs": "/docs", "health": "/api/"}


@api.post("/floorplan/segment")
def segment(body: ImageIn):
    rgb, key = decode_image(body.image_base64)
    room_mask, icon_mask = masks_for(rgb, key)
    try:
        geo = extract_geometry(room_mask, icon_mask)
    except ValueError as e:
        return {"method": "cubicasa5k", "rooms": [], "note": str(e)}
    h, w = room_mask.shape
    rooms = []
    for r in sorted(geo.rooms, key=lambda r: -r["polygon"].area):
        p = r["polygon"].simplify(max(w, h) * 0.004, preserve_topology=True)
        rooms.append({
            "polygon": [[round(x / w * 1000, 1), round(y / h * 1000, 1)] for x, y in list(p.exterior.coords)[:-1]],
            "area": round(r["polygon"].area / (w * h), 5),
            "type": r["type"], "label": r["label"], "confidence": r["confidence"],
        })
    return {"method": "cubicasa5k", "rooms": rooms}


@api.post("/floorplan/3d")
def model_3d(body: Model3DIn):
    t0 = time.time()
    rgb, key = decode_image(body.image_base64)
    room_mask, icon_mask = masks_for(rgb, key)
    settings = Settings(wall_height=body.wall_height)
    try:
        geo = extract_geometry(room_mask, icon_mask, sqft=body.sqft, settings=settings)
    except ValueError as e:
        raise HTTPException(422, str(e))
    glb = build_scene(geo, settings).export(file_type="glb")
    return {
        "glb_base64": base64.b64encode(glb).decode(),
        "floorplan": geometry_to_json(geo, settings),
        "seconds": round(time.time() - t0, 1),
    }


app.include_router(api)


@app.on_event("startup")
def warm_up():
    # load the model in the background so the first request is faster
    threading.Thread(target=recognizer, daemon=True).start()
