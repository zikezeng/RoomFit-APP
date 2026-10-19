import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { CATEGORIES } from "@/src/lib/catalog";
import { SAMPLE_ROOM, calibrate } from "@/src/lib/geometry";
import { generateLayouts, trySwap } from "@/src/lib/solver";
import { CategoryId, Layout, MoodId, Need, PlacedItem, Room, StyleId } from "@/src/lib/types";
import { storage } from "@/src/utils/storage";

export interface FloorPlanFile {
  source: "sample" | "upload" | null;
  uri: string | null;
  name: string | null;
  kind: "image" | "pdf" | null;
}

export interface PlanState {
  floorPlan: FloorPlanFile;
  room: Room;
  dimsConfirmed: boolean;
  needs: Record<CategoryId, Need>;
  styles: StyleId[];
  moods: MoodId[];
  inspirations: string[];
  budget: number;
  allocations: Record<CategoryId, number>;
  layouts: Layout[] | null;
  seed: number;
  selectedLayoutId: string | null;
  plan: PlacedItem[] | null;
}

const defaultNeeds = () =>
  Object.fromEntries(CATEGORIES.map((c) => [c.id, { qty: c.defaultPriority === "essential" ? 1 : 0, priority: c.defaultPriority }])) as Record<CategoryId, Need>;

export const initialState = (): PlanState => ({
  floorPlan: { source: null, uri: null, name: null, kind: null },
  room: SAMPLE_ROOM,
  dimsConfirmed: false,
  needs: defaultNeeds(),
  styles: [],
  moods: [],
  inspirations: [],
  budget: 2500,
  allocations: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultPct])) as Record<CategoryId, number>,
  layouts: null,
  seed: 0,
  selectedLayoutId: null,
  plan: null,
});

/** Mia's demo scenario: sample plan, 3.6 m wall confirmed, Japandi + warm, $2,500. */
export const demoState = (): PlanState => {
  const s = initialState();
  const needs = defaultNeeds();
  needs.armchair.qty = 1;
  needs.side_table.qty = 1;
  needs.floor_lamp.qty = 1;
  needs.rug.qty = 1;
  return {
    ...s,
    floorPlan: { source: "sample", uri: null, name: "Mia's apartment — living room (sample)", kind: null },
    room: calibrate(SAMPLE_ROOM, "left", 360),
    dimsConfirmed: true,
    needs,
    styles: ["japandi"],
    moods: ["warm"],
  };
};

type Invalidate = "all" | "layouts" | "none";
const KEY = "roomfit_state_v1";

interface Ctx {
  state: PlanState;
  ready: boolean;
  update: (patch: Partial<PlanState>, invalidate?: Invalidate) => void;
  generate: (seed: number) => void;
  selectLayout: (id: string) => void;
  swap: (uid: string, productId: string) => ReturnType<typeof trySwap>;
  reset: () => void;
  loadDemo: () => void;
}

const PlanContext = createContext<Ctx | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlanState>(initialState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    storage.getItem(KEY, null as string | null).then((raw) => {
      if (raw) {
        try {
          setState({ ...initialState(), ...(JSON.parse(raw) as PlanState) });
        } catch {}
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) storage.setItem(KEY, JSON.stringify(state));
  }, [state, ready]);

  const update = useCallback((patch: Partial<PlanState>, invalidate: Invalidate = "none") => {
    setState((s) => {
      const n = { ...s, ...patch };
      if (invalidate !== "none") {
        n.layouts = null;
        n.selectedLayoutId = null;
      }
      if (invalidate === "all") n.plan = null;
      return n;
    });
  }, []);

  const generate = useCallback((seed: number) => {
    const s = stateRef.current;
    const layouts = generateLayouts({ room: s.room, needs: s.needs, prefs: { styles: s.styles, moods: s.moods }, budget: s.budget, allocations: s.allocations, seed });
    setState((p) => ({ ...p, layouts, seed, selectedLayoutId: null }));
  }, []);

  const selectLayout = useCallback((id: string) => {
    setState((s) => {
      const l = s.layouts?.find((x) => x.id === id);
      return l ? { ...s, selectedLayoutId: id, plan: l.items.map((i) => ({ ...i })) } : s;
    });
  }, []);

  const swap = useCallback((uid: string, productId: string) => {
    const s = stateRef.current;
    const r = trySwap(s.room, s.plan ?? [], uid, productId, s.budget);
    if (r.valid) setState((p) => ({ ...p, plan: r.items }));
    return r;
  }, []);

  const reset = useCallback(() => setState(initialState()), []);
  const loadDemo = useCallback(() => setState(demoState()), []);

  const value = useMemo(() => ({ state, ready, update, generate, selectLayout, swap, reset, loadDemo }), [state, ready, update, generate, selectLayout, swap, reset, loadDemo]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const c = useContext(PlanContext);
  if (!c) throw new Error("usePlan must be used inside PlanProvider");
  return c;
}
