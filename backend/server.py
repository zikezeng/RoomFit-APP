from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import re
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Probe endpoint for the deployer and pod health checks: root-level (not /api), no DB call.
@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# ---------------- Floor plan recognition (vision LLM suggestion) ----------------
KINDS = {"living", "bedroom", "kitchen", "bathroom", "closet", "balcony", "dining", "hallway", "other"}

DETECT_PROMPT = """Analyze this architectural floor plan image.
Use normalized integer coordinates 0-1000: (0,0) is the image top-left, x grows right (relative to image width), y grows down (relative to image height).
Return ONLY a JSON object, no prose:
{"rooms":[{"label":"Bedroom","kind":"bedroom","polygon":[[x,y],[x,y],...]}],
 "doors":[{"x1":0,"y1":0,"x2":0,"y2":0}],
 "windows":[{"x1":0,"y1":0,"x2":0,"y2":0}],
 "fixtures":[{"label":"Kitchen counter","x1":0,"y1":0,"x2":0,"y2":0}]}
Rules:
- kind is one of: living, bedroom, kitchen, bathroom, closet, balcony, dining, hallway, other.
- Each room polygon follows the inside face of that room's walls, clockwise. Use extra vertices for L-shapes and offsets. Rooms must not overlap. Split open-plan living/kitchen into separate polygons at the natural boundary.
- Doors: a segment spanning the door opening, lying on the wall line. Windows: a segment along the wall where the window is.
- Fixtures: built-in, non-movable items (kitchen counters, island, bathtub, shower) as axis-aligned rectangles (x1,y1 top-left; x2,y2 bottom-right).
- Read the text labels printed inside the plan to name and type each room; each room polygon must contain its own label and match the drawn walls at those exact positions.
- Do not output or guess any real-world dimensions."""


class DetectRequest(BaseModel):
    image_base64: str


def _clamp(v):
    try:
        return max(0.0, min(1000.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


async def detect_floorplan(req: DetectRequest):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "EMERGENT_LLM_KEY missing")
    b64 = req.image_base64.split(",", 1)[-1]
    data = None
    primary = os.environ.get("FLOORPLAN_MODEL", "gemini-3.1-pro-preview")
    used = primary
    for attempt, model in enumerate([primary, primary, "gemini-3-flash-preview"]):
        used = model
        chat = LlmChat(api_key=key, session_id=f"floorplan-{uuid.uuid4()}", system_message="You are a precise floor-plan structure detection model that outputs strict JSON.").with_model("gemini", model)
        try:
            raw = await chat.send_message(UserMessage(text=DETECT_PROMPT, file_contents=[ImageContent(image_base64=b64)]))
        except Exception as e:
            logger.exception("detect failed (attempt %s)", attempt + 1)
            if "Budget has been exceeded" in str(e):
                raise HTTPException(402, "AI recognition unavailable: the Universal Key balance is used up (top up in Profile → Universal Key)")
            continue
        text = raw if isinstance(raw, str) else str(raw)
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            continue
        try:
            data = json.loads(re.sub(r",\s*([}\]])", r"\1", m.group(0)))
            break
        except json.JSONDecodeError:
            logger.warning("invalid JSON from recognition (attempt %s)", attempt + 1)
    if data is None:
        raise HTTPException(502, "Recognition returned no valid structured result")
    rooms = []
    for r in data.get("rooms", []):
        poly = [[_clamp(p[0]), _clamp(p[1])] for p in r.get("polygon", []) if isinstance(p, (list, tuple)) and len(p) >= 2]
        if len(poly) >= 3:
            kind = r.get("kind") if r.get("kind") in KINDS else "other"
            rooms.append({"label": str(r.get("label") or kind.title())[:40], "kind": kind, "polygon": poly})
    seg = lambda o: {k: _clamp(o.get(k)) for k in ("x1", "y1", "x2", "y2")}

    def valid_seg(o):
        if not isinstance(o, dict) or any(o.get(k) is None for k in ("x1", "y1", "x2", "y2")):
            return False
        s_ = seg(o)
        length = ((s_["x2"] - s_["x1"]) ** 2 + (s_["y2"] - s_["y1"]) ** 2) ** 0.5
        return 3 <= length <= 300
    return {
        "model": used,
        "rooms": rooms,
        "doors": [seg(o) for o in data.get("doors", []) if valid_seg(o)],
        "windows": [seg(o) for o in data.get("windows", []) if valid_seg(o)],
        "fixtures": [{**seg(o), "label": str(o.get("label") or "Fixture")[:40]} for o in data.get("fixtures", []) if isinstance(o, dict) and all(o.get(k) is not None for k in ("x1", "y1", "x2", "y2"))],
    }

# Recognition can exceed the ingress timeout, so it runs as a background job that the app polls.
import asyncio
DETECT_JOBS: dict = {}


@api_router.post("/floorplan/detect")
async def start_detect(req: DetectRequest):
    job_id = str(uuid.uuid4())
    DETECT_JOBS[job_id] = {"status": "running"}

    async def run():
        try:
            DETECT_JOBS[job_id] = {"status": "done", "result": await detect_floorplan(req)}
        except HTTPException as e:
            DETECT_JOBS[job_id] = {"status": "error", "detail": e.detail}
        except Exception as e:  # noqa: BLE001
            logger.exception("detect job failed")
            DETECT_JOBS[job_id] = {"status": "error", "detail": str(e)}

    asyncio.create_task(run())
    return {"job_id": job_id}


@api_router.get("/floorplan/detect/{job_id}")
async def get_detect(job_id: str):
    job = DETECT_JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return job

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
