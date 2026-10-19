// Integration points for the research pipeline (Python services: U-Net/CubiCasa5K, CLIP, LLM).
// None are connected in this prototype — the app uses transparent deterministic fallbacks.

export interface FloorPlanDetection {
  available: boolean;
  message: string;
}

/** Future: POST the image to a floor-plan recognition API that returns walls/doors/windows. */
export async function detectFloorPlan(_uri: string): Promise<FloorPlanDetection> {
  return {
    available: false,
    message:
      "Automatic wall, door and window detection is not connected in this prototype. Please define your room dimensions and openings manually.",
  };
}

export const STYLE_ENGINE = {
  isAI: false,
  label: "Metadata tag ranking",
  note: "Products are ranked by style & mood tags. CLIP image matching is not running in this prototype.",
};
