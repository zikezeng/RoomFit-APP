// Floor-plan recognition: a vision LLM (Gemini via backend) proposes rooms/doors/windows as an
// editable AI suggestion. It does not read real dimensions — the user always calibrates scale.
// A dedicated model (U-Net / CubiCasa5K) can replace this endpoint later with the same response shape.
import { RoomKind } from "./types";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface DetectionResult {
  model: string;
  rooms: { label: string; kind: RoomKind; polygon: number[][] }[];
  doors: Record<string, number>[];
  windows: Record<string, number>[];
  fixtures: (Record<string, number> & { label: string })[];
}

export async function detectFloorPlan(base64: string): Promise<DetectionResult> {
  const res = await fetch(`${API}/api/floorplan/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64 }),
  });
  if (!res.ok) throw new Error(`Recognition failed (${res.status})`);
  const { job_id } = await res.json();
  // Poll the background job (vision models can take up to ~1-2 minutes).
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch(`${API}/api/floorplan/detect/${job_id}`).then((r) => r.json());
    if (j.status === "done") return j.result;
    if (j.status === "error") throw new Error(j.detail ?? "Recognition failed");
  }
  throw new Error("Recognition timed out");
}

/** Deterministic wall-based room segmentation (OpenCV on the backend, no AI). Polygons are 0-1000 normalised. */
export async function segmentFloorPlan(base64: string): Promise<{ method: string; rooms: { polygon: number[][]; area: number; type?: RoomKind; label?: string }[] }> {
  const res = await fetch(`${API}/api/floorplan/segment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64 }),
  });
  if (!res.ok) throw new Error(`Segmentation failed (${res.status})`);
  return res.json();
}

export const STYLE_ENGINE = {
  isAI: false,
  label: "Metadata tag ranking",
  note: "Products are ranked by style & mood tags. CLIP image matching is not running in this prototype.",
};
