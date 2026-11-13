import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildGeom, RoomGeom, sampleApartment } from "@/src/lib/apartment";
import { CATEGORIES, FURNISHABLE, setCustomProducts } from "@/src/lib/catalog";
import { generateLayouts, trySwap } from "@/src/lib/solver";
import { Apartment, CategoryId, HomeType, Layout, MoodId, Need, PlacedItem, Product, RoomKind, RoomSpec, StyleId } from "@/src/lib/types";
import { storage } from "@/src/utils/storage";

export type RoomConfig = Pick<PlanState, "needsKind" | "needs" | "customItems" | "budget" | "allocations">;

export interface PlanState {
  selectedRoomIds: string[];
<<<<<<< Updated upstream
  roomConfigs: Record<string, RoomConfig>;
=======
  roomProgress: Record<string, RoomProgress>;
>>>>>>> Stashed changes
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

export type RoomProgress = Pick<PlanState, "roomKind" | "needsKind" | "needs" | "customItems" | "budget" | "allocations" | "layouts" | "seed" | "selectedLayoutId" | "plan">;
export const roomRank = (kind: RoomKind) => kind === "living" ? 0 : kind === "bedroom" ? 1 : FURNISHABLE.includes(kind) ? 2 : 3;
export function saveRoom(s: PlanState): PlanState {
  if (!s.selectedRoomId) return s;
  const { roomKind, needsKind, needs, customItems, budget, allocations, layouts, seed, selectedLayoutId, plan } = s;
  return { ...s, roomProgress: { ...s.roomProgress, [s.selectedRoomId]: { roomKind, needsKind, needs, customItems, budget, allocations, layouts, seed, selectedLayoutId, plan } } };
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
    layouts: null, seed: 0, selectedLayoutId: null, plan: null,
  }), selectedRoomId: id });
}
export function toggleRoom(s: PlanState, id: string): PlanState {
  const room = s.apartment.rooms.find(r => r.id === id);
  if (!room || !FURNISHABLE.includes(room.kind)) return s;
  const ids = new Set(s.selectedRoomIds);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  return { ...saveRoom(s), selectedRoomIds: [...s.apartment.rooms].sort((a,b) => roomRank(a.kind) - roomRank(b.kind)).filter(r => ids.has(r.id)).map(r => r.id) };
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
<<<<<<< Updated upstream
  roomConfigs: {},
=======
  roomProgress: {},
>>>>>>> Stashed changes
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
  return { ...initialState(), apartment: sampleApartment(), room: SAMPLE_ROOM, dimsConfirmed: true, roomKind: "living", selectedRoomId: "r-liv", selectedRoomIds: ["r-liv"], needsKind: "living", needs, styles: ["japandi"], moods: ["warm"] };
};

export const configOf = (s: RoomConfig): RoomConfig => ({ needsKind: s.needsKind, needs: s.needs, customItems: s.customItems, budget: s.budget, allocations: s.allocations });
export const configsOf = (s: PlanState) => s.selectedRoomId ? { ...s.roomConfigs, [s.selectedRoomId]: configOf(s) } : s.roomConfigs;
export const totalBudget = (s: PlanState) => s.selectedRoomIds.reduce((sum, id) => sum + (configsOf(s)[id]?.budget ?? 0), 0);
export const itemCount = (c: RoomConfig) => c.customItems.length + Object.values(c.needs).reduce((sum, n) => sum + (n?.qty ?? 0), 0);
function activateRoom(s: PlanState, id: string): PlanState {
  const room = s.apartment.rooms.find((r) => r.id === id)!;
  const saved = configsOf(s);
  const c = saved[id];
  const config = c?.needsKind === room.kind ? c : { ...configOf(initialState()), needsKind: room.kind, needs: defaultNeeds(room.kind, s.apartment.homeType) };
  return { ...s, ...config, roomKind: room.kind, selectedRoomId: id, roomConfigs: { ...saved, [id]: config } };
}

/** Upgrade saved single-room sessions without discarding furniture or budgets. */
export function restoreState(saved: Partial<PlanState>): PlanState {
  let s = { ...initialState(), ...saved };
  const ids = (saved.selectedRoomIds ?? (saved.selectedRoomId ? [saved.selectedRoomId] : []))
    .filter((id) => s.apartment.rooms.some((r) => r.id === id && FURNISHABLE.includes(r.kind)));
  const active = ids.includes(s.selectedRoomId!) ? s.selectedRoomId : ids[0];
  s = { ...s, selectedRoomIds: ids };
  for (const id of ids) s = activateRoom(s, id);
  return active ? activateRoom(s, active) : { ...s, selectedRoomId: null, roomKind: null };
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
<<<<<<< Updated upstream
  toggleRoom: (id: string) => void;
=======
  startRooms: () => void;
  nextRoom: () => void;
  previousRoom: () => void;
>>>>>>> Stashed changes
  generate: (seed: number) => void;
  selectLayout: (id: string) => void;
  swap: (uid: string, productId: string) => ReturnType<typeof trySwap> | null;
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
<<<<<<< Updated upstream
  stateRef.current = state;
  setCustomProducts([...Object.values(configsOf(state)).flatMap((c) => c.customItems)]);
=======
  useLayoutEffect(() => { stateRef.current = state; }, [state]);
  setCustomProducts([...Object.values(state.roomProgress).flatMap(r => r.customItems), ...state.customItems]);
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
=======
  const geomRef = useRef(geom);
  useLayoutEffect(() => { geomRef.current = geom; }, [geom]);
>>>>>>> Stashed changes

  const update = useCallback((patch: Partial<PlanState>, invalidate: Invalidate = "none") => {
    setState((s) => {
      const n = { ...s, ...patch };
      if (n.selectedRoomId) n.roomConfigs = { ...n.roomConfigs, [n.selectedRoomId]: configOf(n) };
      if (invalidate !== "none") {
        n.layouts = null;
        n.selectedLayoutId = null;
      }
      if (invalidate !== "none") n.plan = null;
      return n;
    });
  }, [setState]);

  /** Any change to the apartment geometry invalidates layouts and the furnished plan. */
  const setApartment = useCallback((fn: (a: Apartment) => Apartment) => {
    setState((s) => {
      const apartment = fn(s.apartment);
<<<<<<< Updated upstream
      const ids = s.selectedRoomIds.filter((id) => apartment.rooms.some((r) => r.id === id && FURNISHABLE.includes(r.kind)));
      const active = ids.includes(s.selectedRoomId!) ? s.selectedRoomId : ids[0] ?? null;
      let next: PlanState = { ...s, apartment, selectedRoomIds: ids, layouts: null, selectedLayoutId: null, plan: null };
      for (const id of ids) next = activateRoom(next, id);
      return active ? activateRoom(next, active) : { ...next, selectedRoomId: null, roomKind: null };
=======
      const keepRoom = apartment.rooms.some((r) => r.id === s.selectedRoomId);
      return { ...s, apartment, selectedRoomId: keepRoom ? s.selectedRoomId : null,
        selectedRoomIds: s.selectedRoomIds.filter(id => apartment.rooms.some(r => r.id === id && FURNISHABLE.includes(r.kind))),
        roomProgress: {}, layouts: null, selectedLayoutId: null, plan: null };
>>>>>>> Stashed changes
    });
  }, [setState]);

<<<<<<< Updated upstream
  const selectRoom = useCallback((id: string) => {
    setState((s) => s.selectedRoomIds.includes(id) ? activateRoom(s, id) : s);
  }, []);
  const toggleRoom = useCallback((id: string) => {
    setState((s) => {
      const room = s.apartment.rooms.find((r) => r.id === id);
      if (!room || !FURNISHABLE.includes(room.kind)) return s;
      const ids = s.selectedRoomIds.includes(id) ? s.selectedRoomIds.filter((x) => x !== id) : [...s.selectedRoomIds, id];
      const next = { ...s, roomConfigs: configsOf(s), selectedRoomIds: ids, layouts: null, selectedLayoutId: null, plan: null };
      const active = ids.includes(s.selectedRoomId!) ? s.selectedRoomId : ids[0];
      return active ? activateRoom(ids.includes(id) ? activateRoom(next, id) : next, active) : { ...next, selectedRoomId: null, roomKind: null };
    });
  }, []);
=======
  const selectRoom = useCallback((id: string) => setState(s => toggleRoom(s, id)), [setState]);
  const startRooms = useCallback(() => setState(s => s.selectedRoomIds.length ? activateRoom(s, s.selectedRoomIds[0]) : s), [setState]);
  const previousRoom = useCallback(() => setState(s => {
    const previous = s.selectedRoomIds[s.selectedRoomIds.indexOf(s.selectedRoomId ?? "") - 1];
    return previous ? activateRoom(s, previous) : s;
  }), [setState]);
  const nextRoom = useCallback(() => setState(s => {
    const next = s.selectedRoomIds[s.selectedRoomIds.indexOf(s.selectedRoomId ?? "") + 1];
    return s.plan && next ? activateRoom(s, next) : s;
  }), [setState]);
>>>>>>> Stashed changes

  const generate = useCallback((seed: number) => {
    const s = stateRef.current;
    const configs = configsOf(s);
    const sets = s.selectedRoomIds.map((id) => {
      const g = buildGeom(s.apartment, id);
      return g ? generateLayouts({ geom: g, ...configs[id], prefs: { styles: s.styles, moods: s.moods }, seed }) : null;
    });
    if (!sets.length || sets.some((x) => !x)) return;
    const layouts = [0, 1, 2].map((index): Layout => {
      // A room may fit only one strategy. Reuse its valid strategy rather than
      // rejecting an otherwise feasible apartment because variant indices differ.
      const parts = sets.map((set) => sets.length === 1 || set![index].valid ? set![index] : set!.find((l) => l.valid) ?? set![index]);
      const label = (i: number) => s.apartment.rooms.find((r) => r.id === s.selectedRoomIds[i])!.label;
      return { ...parts[0], id: `s${seed}-${index}`, name: parts.length === 1 ? parts[0].name : `Layout ${"ABC"[index]} — All rooms`,
        tagline: parts.length === 1 ? parts[0].tagline : "Furniture placed and checked in every selected room.",
        valid: parts.every((p) => p.valid), total: parts.reduce((sum, p) => sum + p.total, 0),
        items: parts.flatMap((p, i) => p.items.map((item) => ({ ...item, roomId: s.selectedRoomIds[i], uid: parts.length === 1 ? item.uid : `${s.selectedRoomIds[i]}:${item.uid}` }))),
        checks: parts.flatMap((p, i) => p.checks.map((c) => ({ ...c, id: `${i}:${c.id}`, label: parts.length === 1 ? c.label : `${label(i)}: ${c.label}` }))),
        problems: parts.flatMap((p, i) => p.problems.map((v) => `${label(i)}: ${v}`)), suggestions: parts.flatMap((p) => p.suggestions) };
    });
    setState((p) => ({ ...p, layouts, seed, selectedLayoutId: null }));
  }, [setState]);

  const selectLayout = useCallback((id: string) => {
    setState((s) => {
      const l = s.layouts?.find((x) => x.id === id);
      return l ? { ...s, selectedLayoutId: id, plan: l.items.map((i) => ({ ...i })) } : s;
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
    if (r.valid) setState((p) => ({ ...p, plan: p.plan!.map((i) => r.items.find((x) => x.uid === i.uid) ?? i) }));
    return r;
  }, [setState]);

  const reset = useCallback(() => setState(initialState()), [setState]);
  const loadDemo = useCallback(() => setState(demoState()), [setState]);

  const value = useMemo(
<<<<<<< Updated upstream
    () => ({ state, ready, geom, update, setApartment, selectRoom, toggleRoom, generate, selectLayout, swap, reset, loadDemo }),
    [state, ready, geom, update, setApartment, selectRoom, toggleRoom, generate, selectLayout, swap, reset, loadDemo],
=======
    () => ({ state, ready, geom, update, setApartment, selectRoom, startRooms, nextRoom, previousRoom, generate, selectLayout, swap, reset, loadDemo }),
    [state, ready, geom, update, setApartment, selectRoom, startRooms, nextRoom, previousRoom, generate, selectLayout, swap, reset, loadDemo],
>>>>>>> Stashed changes
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const c = useContext(PlanContext);
  if (!c) throw new Error("usePlan must be used inside PlanProvider");
  return c;
}
