"""Deterministic (non-AI) floor-plan room segmentation with OpenCV.

Walls = dark pixels. Door gaps are closed by dilating walls, enclosed white regions become
room candidates, which are grown back into the open floor and traced as polygons.
Room *types* are not recognised here — the app proposes names that the user confirms.
"""
import base64

import cv2
import numpy as np


def segment_rooms(image_b64: str) -> dict:
    data = np.frombuffer(base64.b64decode(image_b64.split(",", 1)[-1]), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("Unreadable image")
    h, w = img.shape
    scale = 1000.0 / max(h, w)
    small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape
    _, walls = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Drop small blobs (room labels, dimension text); keep walls and window lines.
    n, lab, st, _ = cv2.connectedComponentsWithStats(walls, connectivity=8)
    keep = np.zeros(n, np.uint8)
    keep[1:] = (np.maximum(st[1:, 2], st[1:, 3]) > max(sh, sw) * 0.06).astype(np.uint8)
    walls = (keep[lab] * 255).astype(np.uint8)
    best = []
    # Close door gaps of different sizes; keep the closing that separates the most rooms.
    for frac in (0.05, 0.07, 0.09, 0.11):
        k = max(9, int(max(sh, sw) * frac))
        closed = cv2.morphologyEx(walls, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
        found = _rooms(cv2.bitwise_not(closed), sh, sw)
        if len(found) > len(best):
            best = found
    rooms = best
    rooms.sort(key=lambda r: -r["area"])
    return {"method": "opencv-wall-segmentation", "rooms": rooms}


def _rooms(free, sh, sw):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    rooms = []
    min_area = sh * sw * 0.006
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < min_area or x <= 1 or y <= 1 or x + bw >= sw - 1 or y + bh >= sh - 1:
            continue  # tiny region or outside the apartment
        mask = np.uint8(labels == i) * 255
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cnts, key=cv2.contourArea)
        poly = cv2.approxPolyDP(c, 0.015 * cv2.arcLength(c, True), True).reshape(-1, 2)
        if len(poly) >= 3:
            rooms.append({"polygon": [[round(float(px) / sw * 1000, 1), round(float(py) / sh * 1000, 1)] for px, py in poly], "area": float(area) / (sw * sh)})
    return rooms
