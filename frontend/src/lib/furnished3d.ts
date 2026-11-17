// Builds the data for the furnished 3D preview (Step 9).
//
// One source of truth, shared with the 2D plan and the shopping list:
//   - position / size / orientation come from the layout item (PlacedItem + its layout product) through
//     the same footprint() the 2D plan uses;
//   - what the piece IS (title, photo, price, shop) comes from state.realSelections[uid] when the user
//     has chosen a real product in Step 8. Nothing chosen yet → a neutral piece named by furniture type.
// The viewer (Furnished3DView) only draws what this file hands it. All lengths are in cm.
import { bbox, buildGeom, roomScale, scaleOf } from "./apartment";
import { CATEGORY_MAP, getProduct } from "./catalog";
import { fitCheck, hasRealSize, productColor, shapeHints, sizeText } from "./product-fit";
import { footprint } from "./solver";
import { CategoryId, Facing, PlacedItem, Pt, RealProductSelection, RoomKind } from "./types";
import type { PlanState } from "../state/plan-store";

export const WHOLE_HOME = "__whole_home__";

export interface Scene3DItem {
  uid: string;
  roomId: string;
  category: CategoryId;
  /** Furniture type, numbered when a room has several ("Dining chair 2"). */
  label: string;
  /** Centre of the footprint on the floor. */
  x: number;
  z: number;
  /** Size of the piece itself (before rotation): width, depth, height. */
  w: number;
  d: number;
  h: number;
  /** Rotation about the vertical axis, radians. 0 = front faces "down" on the 2D plan. */
  rot: number;
  color: string;
  /** Space the layout keeps for this piece (cm). Equal to w/d unless the real product's size is known. */
  spaceW: number;
  spaceD: number;
  /** True when w/d/h come (at least partly) from the real product's size. */
  realSize: boolean;
  sizeText: string | null;
  fit: "ok" | "warn" | "unknown" | null;
  fitText: string | null;
  seats?: number;
  sectional?: boolean;
  round?: boolean;
  status: "real" | "custom" | "unchosen";
  title: string | null;
  image: string | null;
  priceText: string | null;
  retailer: string | null;
  url: string | null;
}
export interface Scene3DRoom {
  id: string;
  label: string;
  kind: RoomKind;
  poly: Pt[];
  floor: string;
  furnished: boolean;
}
export interface Scene3DOpening {
  type: "door" | "window";
  a: Pt;
  b: Pt;
}
export interface Scene3D {
  id: string;
  mode: "room" | "home";
  rooms: Scene3DRoom[];
  openings: Scene3DOpening[];
  items: Scene3DItem[];
  wallHeight: number;
}
export interface Scene3DColors {
  floor: Record<RoomKind, string>;
  item: (c: CategoryId) => string;
}

const ROT: Record<Facing, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

/** Layout and real choices of one room, whether it is the room being edited or one finished earlier. */
export function roomPlanOf(state: PlanState, roomId: string): { plan: PlacedItem[]; real: Record<string, RealProductSelection> } {
  if (roomId === state.selectedRoomId) return { plan: state.plan ?? [], real: state.realSelections };
  const p = state.roomProgress[roomId];
  return { plan: p?.plan ?? [], real: p?.realSelections ?? {} };
}

/** Rooms that have a chosen layout, in the order the user furnishes them. */
export const furnishedRoomIds = (state: PlanState) => state.selectedRoomIds.filter((id) => roomPlanOf(state, id).plan.length > 0);

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function itemsOfRoom(state: PlanState, roomId: string, colors: Scene3DColors, place: (p: Pt) => Pt, k: number): Scene3DItem[] {
  const geom = buildGeom(state.apartment, roomId);
  if (!geom) return [];
  const { plan, real } = roomPlanOf(state, roomId);
  const totals: Record<string, number> = {};
  const seen: Record<string, number> = {};
  plan.forEach((it) => (totals[it.category] = (totals[it.category] ?? 0) + 1));
  return plan.map((it) => {
    const p = getProduct(it.productId);
    const r = footprint(it, p, geom);
    const c = place({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    seen[it.category] = (seen[it.category] ?? 0) + 1;
    const custom = p.category === "custom";
    const label = custom ? p.name : CATEGORY_MAP[p.category].label + (totals[it.category] > 1 ? ` ${seen[it.category]}` : "");
    const sel = real[it.uid];
    const base = {
      uid: it.uid, roomId, category: p.category, label, x: c.x, z: c.y, w: p.width * k, d: p.depth * k, h: p.height * k, rot: ROT[it.facing], color: colors.item(p.category),
      spaceW: p.width, spaceD: p.depth, realSize: false, sizeText: null, fit: null, fitText: null,
    };
    if (sel) {
      const priceText = sel.price_text ?? (sel.price !== null && sel.price !== undefined ? money(sel.price) : null);
      const dt = sel.details;
      const out: Scene3DItem = { ...base, ...shapeHints(p.category, sel.title), status: "real", title: sel.title, image: sel.image, priceText, retailer: sel.retailer, url: sel.url };
      out.color = productColor(sel) ?? base.color;
      const fit = fitCheck(dt, { geom, item: it, others: plan });
      out.sizeText = sizeText(dt);
      out.fit = fit.level;
      out.fitText = fit.text;
      if (dt && hasRealSize(dt)) {
        // Draw the product at its real size where we know it, at the spot the fit check settled on
        // (slid along its wall when it is wider than planned). A piece against a wall keeps its back on
        // that wall, so a deeper product grows into the room, the way it would in real life.
        const real = { ...p, width: dt.width ?? p.width, depth: dt.depth ?? p.depth };
        const rr = footprint({ ...it, ...(fit.at ?? {}) }, real, geom);
        const cc = place({ x: rr.x + rr.w / 2, y: rr.y + rr.h / 2 });
        out.x = cc.x;
        out.z = cc.y;
        out.w = real.width * k;
        out.d = real.depth * k;
        out.h = (dt.height ?? p.height) * k;
        out.realSize = true;
      }
      return out;
    }
    if (custom) return { ...base, status: "custom" as const, title: p.name, image: null, priceText: money(p.price), retailer: null, url: null };
    return { ...base, status: "unchosen" as const, title: null, image: null, priceText: null, retailer: null, url: null };
  });
}

/** One furnished room, in the room's own cm coordinates (identical to the 2D plan). */
export function buildRoomScene(state: PlanState, roomId: string, colors: Scene3DColors): Scene3D | null {
  const geom = buildGeom(state.apartment, roomId);
  if (!geom) return null;
  return {
    id: roomId,
    mode: "room",
    rooms: [{ id: geom.id, label: geom.label, kind: geom.kind, poly: geom.poly, floor: colors.floor[geom.kind], furnished: true }],
    openings: [...geom.doors.map((d) => ({ type: "door" as const, a: d.a, b: d.b })), ...geom.windows.map((w) => ({ type: "window" as const, a: w.a, b: w.b }))],
    items: itemsOfRoom(state, roomId, colors, (p) => p, 1),
    wallHeight: 250,
  };
}

/** The whole apartment with every furnished room in place (low walls, like a dollhouse seen from above). */
export function buildHomeScene(state: PlanState, colors: Scene3DColors): Scene3D | null {
  const ap = state.apartment;
  const withScale = ap.rooms.map((room) => ({ room, s: roomScale(ap, room) })).filter((x): x is { room: (typeof ap.rooms)[number]; s: number } => !!x.s && x.room.poly.length >= 3);
  if (!withScale.length) return null;
  // One scale for the whole drawing so rooms keep their places next to each other.
  const G = scaleOf(ap) ?? withScale.reduce((a, x) => a + x.s, 0) / withScale.length;
  const furnished = new Set(furnishedRoomIds(state));
  const items = withScale.flatMap(({ room, s }) => {
    if (!furnished.has(room.id)) return [];
    const b = bbox(room.poly);
    const k = G / s;
    return itemsOfRoom(state, room.id, colors, (p) => ({ x: b.x0 * G + p.x * k, y: b.y0 * G + p.y * k }), k);
  });
  return {
    id: WHOLE_HOME,
    mode: "home",
    rooms: withScale.map(({ room }) => ({ id: room.id, label: room.label, kind: room.kind, poly: room.poly.map((p) => ({ x: p.x * G, y: p.y * G })), floor: colors.floor[room.kind], furnished: furnished.has(room.id) })),
    openings: ap.openings.map((o) => ({ type: o.type, a: { x: o.a.x * G, y: o.a.y * G }, b: { x: o.b.x * G, y: o.b.y * G } })),
    items,
    wallHeight: 110,
  };
}
