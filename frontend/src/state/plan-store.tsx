import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildGeom, RoomGeom, sampleApartment } from "@/src/lib/apartment";
import { CATEGORIES, FURNISHABLE, setCustomProducts } from "@/src/lib/catalog";
import { generateLayouts, trySwap } from "@/src/lib/solver";
import { Apartment, CategoryId, HomeType, Layout, MoodId, Need, PlacedItem, Product, RealProductSelection, RoomKind, RoomSpec, StyleId } from "@/src/lib/types";
import { storage } from "@/src/utils/storage";

export type RoomConfig = Pick<PlanState, "needsKind" | "needs" | "customItems" | "budget" | "allocations">;

export interface PlanState {
  selectedRoomIds: string[];
  roomProgress: Record<string, RoomProgress>;
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
  /** Final real-world product choices keyed by PlacedItem.uid. */
  realSelections: Record<string, RealProductSelection>;
}

export type RoomProgress = Pick<PlanState, "roomKind" | "needsKind" | "needs" | "customItems" | "budget" | "allocations" | "layouts" | "seed" | "selectedLayoutId" | "plan" | "realSelections">;
export const roomRank = (kind: RoomKind) => kind === "living" ? 0 : kind === "bedroom" ? 1 : FURNISHABLE.includes(kind) ? 2 : 3;
export function saveRoom(s: PlanState): PlanState {
  if (!s.selectedRoomId) return s;
  const { roomKind, needsKind, needs, customItems, budget, allocations, layouts, seed, selectedLayoutId, plan, realSelections } = s;
  return { ...s, roomProgress: { ...s.roomProgress, [s.selectedRoomId]: { roomKind, needsKind, needs, customItems, budget, allocations, layouts, seed, selectedLayoutId, plan, realSelections } } };
}
export function activateRoom(state: PlanState, id: string): PlanState {
  const s = saveRoom(state);
  const room = s.apartment.rooms.find(r => r.id === id);
  if (!room || !s.selectedRoomIds.includes(id)) return s;
  const saved = s.roomProgress[id];
  const defaults = initialState();
  return saveRoom({ ...s, ...(saved?.roomKind === room.kind ? saved : {
    roomKind: room.kind, needsKind: room.kind, needs: defaultNeeds(room.kind, s.apartment.homeType),
    customItems: [], budget: defaults.budget, allocations: defaults.allocations,
    layouts: null, seed: 0, selectedLayoutId: null, plan: null, realSelections: {},
  }), selectedRoomId: id });
}
export function toggleRoom(s: PlanState, id: string): PlanState {
  const room = s.apartment.rooms.find(r => r.id === id);
  if (!room || !FURNISHABLE.includes(room.kind)) return s;
  const ids = new Set(s.selectedRoomIds);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  return { ...saveRoom(s), selectedRoomIds: [...s.apartment.rooms].sort((a,b) => roomRank(a.kind) - roomRank(b.kind)).filter(r => ids.has(r.id)).map(r => r.id) };
}

/** Navigation saves the current room before activating its neighbour. */
export function advanceRoom(s: PlanState, direction: 1 | -1): PlanState {
  const current = s.selectedRoomIds.indexOf(s.selectedRoomId ?? "");
  if (current < 0 || (direction === 1 && !s.plan)) return s;
  const target = s.selectedRoomIds[current + direction];
  return target ? activateRoom(s, target) : s;
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
  selectedRoomIds: [],
  roomProgress: {},
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
  realSelections: {},
});

/** Mia's demo — only loaded when the user explicitly taps "Try a Demo". */
export const demoState = (): PlanState => {
  const needs = defaultNeeds("living");
  needs.armchair = { qty: 1, priority: "essential" };
  needs.side_table = { qty: 1, priority: "optional" };
  needs.floor_lamp = { qty: 1, priority: "essential" };
  needs.rug = { qty: 1, priority: "optional" };
  return { ...initialState(), apartment: sampleApartment(), room: SAMPLE_ROOM, dimsConfirmed: true, roomKind: "living", selectedRoomId: "r-liv", selectedRoomIds: ["r-liv"], needsKind: "living", needs, styles: ["japandi"], moods: ["warm"] };
};

// Existing budget and product-detail components read the current room through these helpers.
export const configOf = (s: RoomConfig): RoomConfig => ({ needsKind: s.needsKind, needs: s.needs, customItems: s.customItems, budget: s.budget, allocations: s.allocations });
export const configsOf = (s: PlanState): Record<string, RoomConfig> => ({ ...s.roomProgress, ...(s.selectedRoomId ? { [s.selectedRoomId]: configOf(s) } : {}) });
export const totalBudget = (s: PlanState) => s.budget;
export const itemCount = (c: RoomConfig) => c.customItems.length + Object.values(c.needs).reduce((sum, n) => sum + (n?.qty ?? 0), 0);

/** Preserve sessions saved by either the single-room or simultaneous-room version. */
export function restoreState(saved: Partial<PlanState> & { roomConfigs?: Record<string, RoomConfig> }): PlanState {
  const s = { ...initialState(), ...saved, roomProgress: { ...saved.roomProgress } };
  s.realSelections = saved.realSelections ?? {};
  for (const [id, progress] of Object.entries(s.roomProgress)) {
    s.roomProgress[id] = { ...progress, realSelections: progress.realSelections ?? {} };
  }
  s.selectedRoomIds = (saved.selectedRoomIds ?? (saved.selectedRoomId ? [saved.selectedRoomId] : []))
    .filter(id => s.apartment.rooms.some(r => r.id === id && FURNISHABLE.includes(r.kind)))
    .sort((a, b) => roomRank(s.apartment.rooms.find(r => r.id === a)!.kind) - roomRank(s.apartment.rooms.find(r => r.id === b)!.kind));
  for (const [id, config] of Object.entries(saved.roomConfigs ?? {})) {
    if (!s.roomProgress[id]) s.roomProgress[id] = { ...config, roomKind: config.needsKind, layouts: null, seed: 0, selectedLayoutId: null, plan: null, realSelections: {} };
  }
  if (saved.plan?.some(item => item.roomId)) {
    for (const id of s.selectedRoomIds) {
      const config = configsOf(s)[id] ?? configOf(s);
      s.roomProgress[id] = {
        ...config,
        roomKind: config.needsKind,
        layouts: null,
        seed: 0,
        selectedLayoutId: null,
        plan: saved.plan.filter(item => item.roomId === id),
        realSelections: s.roomProgress[id]?.realSelections ?? {},
      };
    }
    s.plan = s.roomProgress[s.selectedRoomId ?? ""]?.plan ?? null;
    s.layouts = null;
    s.selectedLayoutId = null;
  }
  if (!s.selectedRoomIds.includes(s.selectedRoomId ?? "")) {
    const first = s.selectedRoomIds[0];
    s.selectedRoomId = null;
    return first ? activateRoom(s, first) : { ...s, roomKind: null, layouts: null, selectedLayoutId: null, plan: null, realSelections: {} };
  }
  return saveRoom(s);
}

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
  startRooms: () => void;
  nextRoom: () => void;
  previousRoom: () => void;
  generate: (seed: number) => void;
  selectLayout: (id: string) => void;
  swap: (uid: string, productId: string) => ReturnType<typeof trySwap> | null;
  selectRealProduct: (uid: string, product: RealProductSelection) => void;
  clearRealProduct: (uid: string) => void;
  reset: () => void;
  loadDemo: () => void;
}

const PlanContext = createContext<Ctx | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, setRawState] = useState<PlanState>(initialState);
  const setState = useCallback((action: React.SetStateAction<PlanState>) => {
    setRawState(previous => saveRoom(typeof action === "function" ? action(previous) : action));
  }, []);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);
  setCustomProducts([...Object.values(state.roomProgress).flatMap(r => r.customItems), ...state.customItems]);

  useEffect(() => {
    Promise.all([storage.getItem(KEY, null as string | null), storage.getItem(IMG_KEY, null as string | null)]).then(([raw, img]) => {
      if (raw) {
        try {
          const s = restoreState(JSON.parse(raw));
          s.apartment = { ...s.apartment, imageUri: img };
          if (!("selectedRoomIds" in JSON.parse(raw))) s.selectedRoomIds = s.selectedRoomId ? [s.selectedRoomId] : [];
          setState(s);
        } catch {}
      }
      setReady(true);
    });
  }, [setState]);

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
  useLayoutEffect(() => { geomRef.current = geom; }, [geom]);

  const update = useCallback((patch: Partial<PlanState>, invalidate: Invalidate = "none") => {
    setState((s) => {
      const n = { ...s, ...patch };
      if (invalidate !== "none") {
        n.layouts = null;
        n.selectedLayoutId = null;
      }
      if (invalidate !== "none") {
        n.plan = null;
        n.realSelections = {};
      }
      return n;
    });
  }, [setState]);

  /** Any change to the apartment geometry invalidates layouts and the furnished plan. */
  const setApartment = useCallback((fn: (a: Apartment) => Apartment) => {
    setState((s) => {
      const apartment = fn(s.apartment);
      const keepRoom = apartment.rooms.some((r) => r.id === s.selectedRoomId);
      return { ...s, apartment, selectedRoomId: keepRoom ? s.selectedRoomId : null,
        selectedRoomIds: s.selectedRoomIds.filter(id => apartment.rooms.some(r => r.id === id && FURNISHABLE.includes(r.kind))),
        roomProgress: {}, layouts: null, selectedLayoutId: null, plan: null, realSelections: {} };
    });
  }, [setState]);

  const selectRoom = useCallback((id: string) => setState(s => toggleRoom(s, id)), [setState]);
  const startRooms = useCallback(() => setState(s => s.selectedRoomIds.length ? activateRoom(s, s.selectedRoomIds[0]) : s), [setState]);
  const previousRoom = useCallback(() => setState(s => advanceRoom(s, -1)), [setState]);
  const nextRoom = useCallback(() => setState(s => advanceRoom(s, 1)), [setState]);

  const generate = useCallback((seed: number) => {
    const s = stateRef.current;
    const g = geomRef.current;
    if (!g) return;
    const layouts = generateLayouts({ geom: g, needs: s.needs, customItems: s.customItems, prefs: { styles: s.styles, moods: s.moods }, budget: s.budget, allocations: s.allocations, seed });
    setState((p) => ({ ...p, layouts, seed, selectedLayoutId: null }));
  }, [setState]);

  const selectLayout = useCallback((id: string) => {
    setState((s) => {
      const l = s.layouts?.find((x) => x.id === id);
      return l ? { ...s, selectedLayoutId: id, plan: l.items.map((i) => ({ ...i })), realSelections: {} } : s;
    });
  }, [setState]);

  const swap = useCallback((uid: string, productId: string) => {
    const s = stateRef.current;
    const item = s.plan?.find((i) => i.uid === uid);
    const id = item?.roomId ?? s.selectedRoomId;
    const g = buildGeom(s.apartment, id);
    if (!g || !s.plan) return null;
    const items = s.plan.filter((i) => (i.roomId ?? s.selectedRoomId) === id);
    const r = trySwap(g, items, uid, productId, configsOf(s)[id!]?.budget ?? s.budget);
    if (r.valid) setState((p) => {
      const realSelections = { ...p.realSelections };
      delete realSelections[uid];
      return { ...p, plan: p.plan!.map((i) => r.items.find((x) => x.uid === i.uid) ?? i), realSelections };
    });
    return r;
  }, [setState]);

  const selectRealProduct = useCallback((uid: string, product: RealProductSelection) => {
    setState((s) => ({ ...s, realSelections: { ...s.realSelections, [uid]: product } }));
  }, [setState]);

  const clearRealProduct = useCallback((uid: string) => {
    setState((s) => {
      const realSelections = { ...s.realSelections };
      delete realSelections[uid];
      return { ...s, realSelections };
    });
  }, [setState]);

  const reset = useCallback(() => setState(initialState()), [setState]);
  const loadDemo = useCallback(() => setState(demoState()), [setState]);

  const value = useMemo(
    () => ({ state, ready, geom, update, setApartment, selectRoom, startRooms, nextRoom, previousRoom, generate, selectLayout, swap, selectRealProduct, clearRealProduct, reset, loadDemo }),
    [state, ready, geom, update, setApartment, selectRoom, startRooms, nextRoom, previousRoom, generate, selectLayout, swap, selectRealProduct, clearRealProduct, reset, loadDemo],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const c = useContext(PlanContext);
  if (!c) throw new Error("usePlan must be used inside PlanProvider");
  return c;
}
