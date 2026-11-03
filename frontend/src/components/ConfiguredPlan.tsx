import React from "react";
import { FloorPlan } from "@/src/components/FloorPlan";
import { PlanCanvas } from "@/src/components/PlanCanvas";
import { PlacedItem } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";

export function ConfiguredPlan(props: { items: PlacedItem[]; selectedUid?: string | null; onPressItem?: (uid: string) => void; testID?: string }) {
  const { state, geom } = usePlan();
  return state.selectedRoomIds.length > 1
    ? <PlanCanvas ap={state.apartment} selectedRoomIds={state.selectedRoomIds} {...props} />
    : geom ? <FloorPlan geom={geom} {...props} /> : null;
}
