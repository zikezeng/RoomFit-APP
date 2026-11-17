// Real size / colour / shape of a product chosen in Step 8, and whether it fits the room
// (not longer than its wall, not blocking a door). Used by the Step 8 list, the product sheet, the Step 9 list and the 3D preview so
// they all say the same thing.
import { pointInPoly, RoomGeom } from "./apartment";
import { CATEGORY_MAP, getProduct } from "./catalog";
import { footprint, rectsOverlap } from "./solver";
import { CategoryId, PlacedItem, Product, Pt, RealProductDetails, RealProductSelection, Rect } from "./types";

const r = (n: number) => Math.round(n);

export const hasRealSize = (d?: RealProductDetails | null) => !!d && d.status === "ok" && (d.width !== null || d.depth !== null || d.height !== null);

/** "151×84×79 cm", "Width 196 cm (depth, height unknown)" or "Size unknown". */
export function sizeText(d?: RealProductDetails | null): string {
  if (!d) return "Size unknown";
  if (d.status === "loading") return "Looking up size…";
  if (!hasRealSize(d)) return "Size unknown";
  if (d.width !== null && d.depth !== null && d.height !== null) return `${r(d.width)}×${r(d.depth)}×${r(d.height)} cm`;
  const known = ([["Width", d.width], ["Depth", d.depth], ["Height", d.height]] as const).filter(([, v]) => v !== null);
  const missing = ([["width", d.width], ["depth", d.depth], ["height", d.height]] as const).filter(([, v]) => v === null).map(([k]) => k);
  return `${known.map(([k, v]) => `${k} ${r(v!)} cm`).join(", ")} (${missing.join(", ")} unknown)`;
}

export interface FitResult {
  level: "ok" | "warn" | "unknown";
  text: string;
  /** Where the piece ends up (room cm). Same as the layout spot when no move was needed. */
  at?: { cx: number; cy: number };
  /** Neighbouring pieces that were moved automatically to make room (uid → new centre). */
  moves?: Record<string, { cx: number; cy: number }>;
  /** Shown only when a neighbour could NOT be moved out of the way. */
  note?: string;
}

/** Everything the check needs about the spot in the layout. */
export interface FitContext {
  geom: RoomGeom | null;
  item: PlacedItem;
  /** All layout items of the room (this one may be included; it is skipped). */
  others: PlacedItem[];
  /** Real details of the other pieces, so neighbours are packed at their real width when known. */
  realOf?: (uid: string) => RealProductDetails | undefined;
}

// Rugs lie flat and mattresses sit in the bed frame: a door can swing over them and they don't block anything.
const FLAT = new Set<CategoryId>(["rug", "mattress"]);
const GAP = 2; // cm between pieces packed along a wall

function insideRoom(rc: Rect, poly: Pt[]) {
  const e = 0.5;
  const pts = [
    { x: rc.x + e, y: rc.y + e }, { x: rc.x + rc.w - e, y: rc.y + e }, { x: rc.x + e, y: rc.y + rc.h - e }, { x: rc.x + rc.w - e, y: rc.y + rc.h - e },
    { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 },
  ];
  return pts.every((p) => pointInPoly(p, poly));
}

const nameOf = (p: Product) => (p.category === "custom" ? p.name : CATEGORY_MAP[p.category].label.toLowerCase());

/** Size used for a piece: its real width/depth when known, else the planned size. */
function sized(p: Product, d?: RealProductDetails) {
  if (!d || d.status !== "ok") return p;
  return { ...p, width: d.width ?? p.width, depth: d.depth ?? p.depth };
}

/**
 * Can the real product go in this room at (or near) its spot? The rule is deliberately simple:
 *   1. it must stay inside the room and not be longer than the wall it stands against;
 *   2. it must not block a door.
 * The planned spot from the layout is only a starting point, not a size limit.
 * Neighbours are rearranged automatically when that is possible:
 *   - pieces on the same wall keep their order and are pushed apart (they fit if their total length
 *     fits the wall and none of them ends up in front of a door);
 *   - free-standing pieces it overlaps are nudged to the nearest free spot.
 * Only a neighbour that cannot be moved is mentioned (as a hint, not a failure).
 * When the depth is unknown we use the layout's depth and say so.
 */
export function fitCheck(d: RealProductDetails | null | undefined, ctx: FitContext): FitResult {
  if (!d || d.status === "loading") return { level: "unknown", text: "Checking size…" };
  if (d.status !== "ok" || d.width === null) {
    return { level: "unknown", text: d.status === "ok" && d.depth !== null ? "Width unknown — check the product page before buying." : "Size unknown — check the product page before buying." };
  }
  const { geom: g, item } = ctx;
  const proxy = getProduct(item.productId);
  if (!g) return { level: "unknown", text: "Room shape unavailable — check the size yourself." };
  const W = d.width;
  const D = d.depth ?? proxy.depth;
  const guessNote = d.depth === null ? " (depth unknown — checked with the planned depth)" : "";
  const real = { ...proxy, width: W, depth: D };
  const blocksDoor = (rc: Rect, p: Product) => !FLAT.has(p.category) && g.doors.some((dr) => rectsOverlap(rc, dr.zone));
  const okRect = (rc: Rect, p: Product) => insideRoom(rc, g.poly) && !blocksDoor(rc, p);
  const ws = item.wall !== null ? g.walls[item.wall] : undefined;
  const along = (it: { cx: number; cy: number }) => (ws?.axis === "h" ? it.cx : it.cy);
  const setAlong = (it: PlacedItem, t: number): PlacedItem => (ws?.axis === "h" ? { ...it, cx: t } : { ...it, cy: t });

  // Rule 1a: not longer than its wall; not deeper than the room is across.
  if (ws) {
    const wallLen = ws.s1 - ws.s0;
    if (W > wallLen + 1) return { level: "warn", text: `${r(W - wallLen)} cm longer than this ${r(wallLen)} cm wall — it won't fit here.` };
    const across = ws.axis === "h" ? g.length : g.width;
    if (D > across - 1) return { level: "warn", text: `${r(D)} cm deep — deeper than the room is across (${r(across)} cm).${guessNote}` };
  }

  // Candidate spots for this piece: along its wall in 5 cm steps, or small nudges if free-standing. Nearest first.
  const cands: { it: PlacedItem; dist: number }[] = [];
  if (ws) {
    const t0 = along(item);
    for (let t = ws.s0 + W / 2; t <= ws.s1 - W / 2 + 0.01; t += 5) cands.push({ it: setAlong(item, t), dist: Math.abs(t - t0) });
    if (t0 - W / 2 >= ws.s0 - 0.5 && t0 + W / 2 <= ws.s1 + 0.5) cands.push({ it: item, dist: 0 });
  } else {
    for (let dx = -60; dx <= 60; dx += 10) for (let dy = -60; dy <= 60; dy += 10) cands.push({ it: { ...item, cx: item.cx + dx, cy: item.cy + dy }, dist: Math.hypot(dx, dy) });
  }
  cands.sort((a, b) => a.dist - b.dist);
  const valid = cands.filter((c) => okRect(footprint(c.it, real, g), real));
  if (!valid.length) {
    const anyInside = cands.some((c) => insideRoom(footprint(c.it, real, g), g.poly));
    if (!anyInside) return { level: "warn", text: ws ? `Doesn't fit along this wall.${guessNote}` : `Too big for the open floor in this room.${guessNote}` };
    return { level: "warn", text: `Would block the door wherever it goes on this ${ws ? "wall" : "spot"}.${guessNote}` };
  }

  // Neighbours, at their real size when known.
  const nb = ctx.others
    .filter((o) => o.uid !== item.uid)
    .map((o) => ({ o, p: sized(getProduct(o.productId), ctx.realOf?.(o.uid)) }))
    .filter(({ p }) => !FLAT.has(p.category));
  const sameWall = ws ? nb.filter(({ o }) => o.wall === item.wall) : [];
  const rest = nb.filter((n) => !sameWall.includes(n));

  /** Push the pieces on this wall apart, keeping their order, around the main piece at `me`. */
  const packWall = (me: PlacedItem): Map<string, PlacedItem> | null => {
    if (!ws) return new Map();
    const moved = new Map<string, PlacedItem>();
    const tMe = along(me);
    const left = sameWall.filter((n) => along(n.o) < along(item)).sort((a, b) => along(b.o) - along(a.o));
    const right = sameWall.filter((n) => along(n.o) >= along(item)).sort((a, b) => along(a.o) - along(b.o));
    let edge = tMe - W / 2;
    for (const n of left) {
      const t = Math.min(along(n.o), edge - GAP - n.p.width / 2);
      if (t - n.p.width / 2 < ws.s0 - 0.5) return null;
      moved.set(n.o.uid, setAlong(n.o, t));
      edge = t - n.p.width / 2;
    }
    edge = tMe + W / 2;
    for (const n of right) {
      const t = Math.max(along(n.o), edge + GAP + n.p.width / 2);
      if (t + n.p.width / 2 > ws.s1 + 0.5) return null;
      moved.set(n.o.uid, setAlong(n.o, t));
      edge = t + n.p.width / 2;
    }
    for (const n of sameWall) if (!okRect(footprint(moved.get(n.o.uid)!, n.p, g), n.p)) return null;
    return moved;
  };

  // Take the nearest spot where the whole wall can be rearranged; otherwise the nearest spot on its own.
  let best = valid[0];
  let wallMoves = packWall(best.it);
  if (!wallMoves) {
    for (const c of valid) {
      const m = packWall(c.it);
      if (m) {
        best = c;
        wallMoves = m;
        break;
      }
    }
  }
  const mainRect = footprint(best.it, real, g);

  // Where every other piece is now (moved wall pieces included).
  const placedRects = new Map<string, Rect>();
  for (const n of nb) placedRects.set(n.o.uid, footprint(wallMoves?.get(n.o.uid) ?? n.o, n.p, g));
  const blocked: string[] = [];
  if (!wallMoves) for (const n of sameWall) if (rectsOverlap(mainRect, placedRects.get(n.o.uid)!)) blocked.push(nameOf(n.p));

  // Free-standing (or other-wall) pieces it now overlaps: nudge each to the nearest free spot.
  const freeMoves = new Map<string, PlacedItem>();
  for (const n of rest) {
    const rc = placedRects.get(n.o.uid)!;
    if (!rectsOverlap(mainRect, rc)) continue;
    const clear = (cand: PlacedItem) => {
      const cr = footprint(cand, n.p, g);
      if (!okRect(cr, n.p) || rectsOverlap(cr, mainRect)) return false;
      for (const [uid, other] of placedRects) if (uid !== n.o.uid && rectsOverlap(cr, other)) return false;
      return !g.obstacles.some((ob) => rectsOverlap(cr, ob.rect));
    };
    let found: PlacedItem | null = null;
    const steps: { dx: number; dy: number; dist: number }[] = [];
    for (let dx = -100; dx <= 100; dx += 10) for (let dy = -100; dy <= 100; dy += 10) steps.push({ dx, dy, dist: Math.hypot(dx, dy) });
    steps.sort((a, b) => a.dist - b.dist);
    for (const s of steps) {
      const w2 = n.o.wall !== null ? g.walls[n.o.wall] : undefined;
      // A piece that stands against a wall only slides along that wall.
      if (w2 && (w2.axis === "h" ? s.dy !== 0 : s.dx !== 0)) continue;
      const cand = { ...n.o, cx: n.o.cx + s.dx, cy: n.o.cy + s.dy };
      if (clear(cand)) {
        found = cand;
        break;
      }
    }
    if (found) {
      freeMoves.set(n.o.uid, found);
      placedRects.set(n.o.uid, footprint(found, n.p, g));
    } else blocked.push(nameOf(n.p));
  }

  const moves: Record<string, { cx: number; cy: number }> = {};
  for (const [uid, it] of [...(wallMoves ?? new Map()), ...freeMoves]) {
    const o = ctx.others.find((x) => x.uid === uid)!;
    if (Math.abs(it.cx - o.cx) > 0.5 || Math.abs(it.cy - o.cy) > 0.5) moves[uid] = { cx: it.cx, cy: it.cy };
  }
  const counts = blocked.reduce<Record<string, number>>((m, n) => ((m[n] = (m[n] ?? 0) + 1), m), {});
  const names = Object.entries(counts).map(([n, c]) => (c > 1 ? `${c} ${n}s` : n));
  return {
    level: "ok",
    text: `Fits: inside the room and clear of the door.${guessNote}`,
    at: { cx: best.it.cx, cy: best.it.cy },
    moves,
    note: names.length
      ? `It would touch the ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]} and there is no room to move ${blocked.length > 1 ? "them" : "it"} — consider a smaller piece.`
      : undefined,
  };
}

// Colour words that show up in product titles and colour fields → a representative colour.
// (Data for the 3D preview, not UI styling.)
const COLOR_WORDS: [RegExp, string][] = [
  [/\b(navy|midnight blue|dark blue)\b/, "#2f3e5c"],
  [/\b(light blue|sky blue|powder blue)\b/, "#a9c1d6"],
  [/\b(teal|turquoise)\b/, "#3f8a8c"],
  [/\b(blue|denim|indigo)\b/, "#5f7895"],
  [/\b(sage|olive|moss)\b/, "#8a9a78"],
  [/\b(emerald|forest green|dark green)\b/, "#2f5d47"],
  [/\b(green)\b/, "#6f9070"],
  [/\b(charcoal|anthracite|dark gr[ae]y|graphite)\b/, "#4a4d52"],
  [/\b(light gr[ae]y|silver|dove)\b/, "#c9cbcc"],
  [/\b(gr[ae]y|grey|slate)\b/, "#8e9196"],
  [/\b(black|ebony|onyx)\b/, "#2b2b2d"],
  [/\b(ivory|cream|off[- ]white|oatmeal|linen|natural)\b/, "#e8e0d0"],
  [/\b(white)\b/, "#f1f0ec"],
  [/\b(beige|sand|taupe|khaki|camel|tan)\b/, "#c9b596"],
  [/\b(walnut|espresso|chocolate|dark brown|mahogany)\b/, "#5e4433"],
  [/\b(brown|cognac|caramel|chestnut|rustic)\b/, "#8a6244"],
  [/\b(oak|maple|birch|pine|bamboo|light wood|natural wood)\b/, "#d2b48c"],
  [/\b(terracotta|rust|burnt orange)\b/, "#b5654a"],
  [/\b(orange)\b/, "#d98a4a"],
  [/\b(mustard|ochre|gold|yellow)\b/, "#d1a93f"],
  [/\b(burgundy|maroon|wine)\b/, "#6e2f3a"],
  [/\b(red)\b/, "#a8433f"],
  [/\b(blush|pink|rose)\b/, "#dba9a8"],
  [/\b(purple|plum|lavender|violet)\b/, "#7d6a94"],
];
export function colorFromText(...texts: (string | null | undefined)[]): string | null {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return null;
  for (const [re, hex] of COLOR_WORDS) if (re.test(t)) return hex;
  return null;
}

/** Colour for the 3D model: from the product photo if the server found one, else from colour words. */
export const productColor = (sel: RealProductSelection): string | null => sel.details?.color ?? colorFromText(sel.details?.colorName, sel.title);

export interface ShapeHints {
  seats?: number;
  sectional?: boolean;
  round?: boolean;
}
/** Shape clues in the product title: "loveseat" → 2 seats, "sectional" → L shape, "round" → round top. */
export function shapeHints(category: CategoryId, title: string): ShapeHints {
  const t = title.toLowerCase();
  const out: ShapeHints = {};
  if (category === "sofa" || category === "armchair") {
    if (/\b(sectional|l[- ]shaped?|chaise|corner sofa)\b/.test(t)) out.sectional = true;
    const n = t.match(/\b([1-4])[- ]?(seat|seater)\b/);
    if (n) out.seats = Number(n[1]);
    else if (/\b(loveseat|love seat|two[- ]seat(er)?|settee)\b/.test(t)) out.seats = 2;
    else if (/\b(three[- ]seat(er)?)\b/.test(t)) out.seats = 3;
  }
  if (["coffee_table", "dining_table", "side_table", "rug", "ottoman", "floor_mirror"].includes(category) && /\b(round|circular|circle)\b/.test(t)) out.round = true;
  return out;
}
