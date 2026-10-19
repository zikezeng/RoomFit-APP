import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { buildGeom, RoomGeom, sampleApartment } from "@/src/lib/apartment";
import { CATEGORIES, setCustomProducts } from "@/src/lib/catalog";
import { generateLayouts, trySwap } from "@/src/lib/solver";
import { Apartment, CategoryId, HomeType, Layout, MoodId, Need, PlacedItem, Product, RoomKind, RoomSpec, StyleId } from "@/src/lib/types";
import { storage } from "@/src/utils/storage";

export interface PlanState {
  apartment: Apartment; // uploaded floor plan (reference image)
  room: RoomSpec; // confirmed room dimensions (Step 2)
  dimsConfirmed: boolean;
  roomKind: RoomKind | null; // Step 3 choice
  selectedRoomId: string | null;
  needsKind: RoomKind | null; // room kind the needs were built for
  needs: Partial<Record<CategoryId, Need>>;
  customItems: Product[];
  styles: StyleId[];
  moods: MoodId[];
  inspirations: string[];
  budget: number;
  allocations: Partial<Record<CategoryId, number>>;
  layouts: Layout[] | null;
  seed: number;
  selectedLayoutId: string | null;
  plan: PlacedItem[] | null;
}

export const emptyApartment = (): Apartment => ({
  source: null,
  fileName: null,
  imageUri: null,
  imgW: 0,
  imgH: 0,
  rooms: [],
  openings: [],
  fixtures: [],
  detection: "none",
  detectionNote: null,
  calib: null,
  autoScale: null,
  sizeSqft: null,
  homeType: null,
  unit: "ft",
});

export const defaultNeeds = (kind: RoomKind, home?: HomeType | null) => {
  const needs = Object.fromEntries(CATEGORIES.filter((c) => c.rooms[kind]).map((c) => [c.id, { qty: c.preselect?.[kind] ?? 0, priority: c.rooms[kind]! }])) as Partial<Record<CategoryId, Need>>;
  // A studio's main room is also the bedroom: sleep essentials are pre-selected there.
  if (home === "studio" && kind === "living") {
    needs.bed_frame = { qty: 1, priority: "essential" };
    needs.mattress = { qty: 1, priority: "essential" };
    needs.nightstand = { qty: 1, priority: "optional" };
    needs.tv_stand = { qty: 0, priority: "optional" };
    needs.dining_table = { qty: 0, priority: "optional" };
  }
  return needs;
};

export const emptyRoom = (): RoomSpec => ({ width: 0, length: 0, door: { wall: "bottom", at: 0.16, width: 90 }, windows: [{ wall: "top", at: 0.5, width: 140 }] });
export const SAMPLE_ROOM: RoomSpec = { width: 480, length: 360, door: { wall: "bottom", at: 0.16, width: 90 }, windows: [{ wall: "top", at: 0.5, width: 160 }, { wall: "right", at: 0.5, width: 120 }] };

export const initialState = (): PlanState => ({
  apartment: emptyApartment(),
  room: emptyRoom(),
  dimsConfirmed: false,
  roomKind: null,
  selectedRoomId: null,
  needsKind: null,
  needs: {},
  customItems: [],
  styles: [],
  moods: [],
  inspirations: [],
  budget: 2500,
  allocations: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultPct])),
  layouts: null,
  seed: 0,
  selectedLayoutId: null,
  plan: null,
});

/** Mia's demo — only loaded when the user explicitly taps "Try a Demo". */
export const demoState = (): PlanState => {
  const needs = defaultNeeds("living");
  needs.armchair = { qty: 1, priority: "essential" };
  needs.side_table = { qty: 1, priority: "optional" };
  needs.floor_lamp = { qty: 1, priority: "essential" };
  needs.rug = { qty: 1, priority: "optional" };
  return { ...initialState(), apartment: sampleApartment(), room: SAMPLE_ROOM, dimsConfirmed: true, roomKind: "living", selectedRoomId: "r-liv", needsKind: "living", needs, styles: ["japandi"], moods: ["warm"] };
};

type Invalidate = "all" | "layouts" | "none";
const KEY = "roomfit_state_v4";
const IMG_KEY = "roomfit_image_v2";

interface Ctx {
  state: PlanState;
  ready: boolean;
  geom: RoomGeom | null;
  update: (patch: Partial<PlanState>, invalidate?: Invalidate) => void;
  setApartment: (fn: (a: Apartment) => Apartment) => void;
  selectRoom: (id: string) => void;
  generate: (seed: number) => void;
  selectLayout: (id: string) => void;
  swap: (uid: string, productId: string) => ReturnType<typeof trySwap> | null;
  reset: () => void;
  loadDemo: () => void;
}

const PlanContext = createContext<Ctx | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlanState>(initialState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  setCustomProducts(state.customItems);

  useEffect(() => {
    Promise.all([storage.getItem(KEY, null as string | null), storage.getItem(IMG_KEY, null as string | null)]).then(([raw, img]) => {
      if (raw) {
        try {
          const s = { ...initialState(), ...(JSON.parse(raw) as PlanState) };
          s.apartment = { ...s.apartment, imageUri: img };
          setState(s);
        } catch {}
      }
      setReady(true);
    });
  }, []);

  // Persist state; the (large) image is stored under its own key only when it changes.
  const lastImg = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const { imageUri, ...rest } = state.apartment;
    storage.setItem(KEY, JSON.stringify({ ...state, apartment: { ...rest, imageUri: null } }));
    if (lastImg.current !== imageUri) {
      lastImg.current = imageUri;
      if (imageUri) storage.setItem(IMG_KEY, imageUri);
      else storage.removeItem(IMG_KEY);
    }
  }, [state, ready]);

  const geom = useMemo(() => buildGeom(state.apartment, state.selectedRoomId), [state.apartment, state.selectedRoomId]);
  const geomRef = useRef(geom);
  geomRef.current = geom;

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

  /** Any change to the apartment geometry invalidates layouts and the furnished plan. */
  const setApartment = useCallback((fn: (a: Apartment) => Apartment) => {
    setState((s) => {
      const apartment = fn(s.apartment);
      const keepRoom = apartment.rooms.some((r) => r.id === s.selectedRoomId);
      return { ...s, apartment, selectedRoomId: keepRoom ? s.selectedRoomId : null, layouts: null, selectedLayoutId: null, plan: null };
    });
  }, []);

  const selectRoom = useCallback((id: string) => {
    setState((s) => {
      const room = s.apartment.rooms.find((r) => r.id === id);
      if (!room || s.selectedRoomId === id) return s;
      const sameKind = s.needsKind === room.kind;
      return { ...s, selectedRoomId: id, roomKind: room.kind, needsKind: room.kind, needs: sameKind ? s.needs : defaultNeeds(room.kind, s.apartment.homeType), layouts: null, selectedLayoutId: null, plan: null };
    });
  }, []);

  const generate = useCallback((seed: number) => {
    const s = stateRef.current;
    const g = geomRef.current;
    if (!g) return;
    const layouts = generateLayouts({ geom: g, needs: s.needs, customItems: s.customItems, prefs: { styles: s.styles, moods: s.moods }, budget: s.budget, allocations: s.allocations, seed });
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
    const g = geomRef.current;
    if (!g || !s.plan) return null;
    const r = trySwap(g, s.plan, uid, productId, s.budget);
    if (r.valid) setState((p) => ({ ...p, plan: r.items }));
    return r;
  }, []);

  const reset = useCallback(() => setState(initialState()), []);
  const loadDemo = useCallback(() => setState(demoState()), []);

  const value = useMemo(
    () => ({ state, ready, geom, update, setApartment, selectRoom, generate, selectLayout, swap, reset, loadDemo }),
    [state, ready, geom, update, setApartment, selectRoom, generate, selectLayout, swap, reset, loadDemo],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const c = useContext(PlanContext);
  if (!c) throw new Error("usePlan must be used inside PlanProvider");
  return c;
}
