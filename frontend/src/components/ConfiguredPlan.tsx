import React from "react";
import { FloorPlan } from "@/src/components/FloorPlan";

import { PlacedItem } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";

export function ConfiguredPlan(props: { items: PlacedItem[]; selectedUid?: string | null; onPressItem?: (uid: string) => void; onMoveItem?: (uid: string, cx: number, cy: number) => void; onDragStateChange?: (active: boolean) => void; editable?: boolean; showDims?: boolean; testID?: string }) {
  const { geom } = usePlan();
  return geom ? <FloorPlan geom={geom} {...props} /> : null;
}
