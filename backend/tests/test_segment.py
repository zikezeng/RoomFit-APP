"""Backend tests for the deterministic OpenCV floor plan segmentation endpoint."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roomfit-1.preview.emergentagent.com").rstrip("/")
SAMPLE_PATH = "/app/tests/sample_floorplan.png"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sample_b64():
    with open(SAMPLE_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode()


class TestFloorPlanSegment:
    def test_segment_returns_opencv_rooms(self, api_client, sample_b64):
        r = api_client.post(f"{BASE_URL}/api/floorplan/segment", json={"image_base64": sample_b64}, timeout=30)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
        body = r.json()
        assert body.get("method") == "opencv-wall-segmentation"
        rooms = body.get("rooms")
        assert isinstance(rooms, list)
        # Expected ~5 rooms (bedroom, living, balcony, bath, wic) with kitchen possibly merged with living
        assert 3 <= len(rooms) <= 8, f"unexpected room count: {len(rooms)}"
        for room in rooms:
            poly = room["polygon"]
            assert isinstance(poly, list) and len(poly) >= 3
            for pt in poly:
                x, y = pt
                assert 0 <= x <= 1000, f"x={x} out of 0-1000"
                assert 0 <= y <= 1000, f"y={y} out of 0-1000"
            assert "area" in room

    def test_segment_rejects_bad_image(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/floorplan/segment", json={"image_base64": "not-a-real-image"}, timeout=15)
        assert r.status_code == 400

    def test_segment_rejects_missing_body(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/floorplan/segment", json={}, timeout=10)
        assert r.status_code == 422
