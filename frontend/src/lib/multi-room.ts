import { buildGeom } from "./apartment";
import { validateLayout } from "./solver";
import { PlacedItem } from "./types";
import { configsOf, PlanState } from "../state/plan-store";

export function validatePlan(state: PlanState, items: PlacedItem[]) {
  const configs = configsOf(state);
  const parts = state.selectedRoomIds.map((id) => {
    const g = buildGeom(state.apartment, id);
    const local = items.filter((i) => (i.roomId ?? state.selectedRoomId) === id);
    if (!g) return { valid: false, total: 0, checks: [{ id, label: "Room geometry", ok: false, detail: "Room geometry is missing." }] };
    const result = validateLayout(g, local, configs[id]?.budget ?? state.budget);
    return { ...result, checks: result.checks.map((c) => ({ ...c, id: id + ":" + c.id, detail: g.label + ": " + c.detail })) };
  });
  const assigned = items.every((i) => state.selectedRoomIds.includes(i.roomId ?? state.selectedRoomId ?? ""));
  return { valid: assigned && parts.length > 0 && parts.every((p) => p.valid), total: parts.reduce((sum, p) => sum + p.total, 0), checks: parts.flatMap((p) => p.checks) };
}
