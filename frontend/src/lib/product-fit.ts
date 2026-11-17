// Real size / colour / shape of a product chosen in Step 8, and whether it fits the room
// (not longer than its wall, not blocking a door). Used by the Step 8 list, the product sheet, the Step 9 list and the 3D preview so
// they all say the same thing.
import { pointInPoly, RoomGeom } from "./apartment";
import { CATEGORY_MAP, getProduct } from "./catalog";
import { footprint, rectsOverlap } from "./solver";
import { CategoryId, PlacedItem, Pt, RealProductDetails, RealProductSelection, Rect } from "./types";

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
  /** Where the piece ends up when it had to slide along its wall (room cm). Same as the layout spot when no move was needed. */
  at?: { cx: number; cy: number };
  /** Non-blocking hint, e.g. a neighbouring piece that would need to move a little. */
  note?: string;
}

/** Everything the check needs about the spot in the layout. */
export interface FitContext {
  geom: RoomGeom | null;
  item: PlacedItem;
  /** Layout item of the room, used only to say which neighbours would need to move. */
  others: PlacedItem[];
}

// Rugs lie flat and mattresses sit in the bed frame: a door can swing over them.
const FLAT = new Set<CategoryId>(["rug", "mattress"]);

function insideRoom(rc: Rect, poly: Pt[]) {
  const e = 0.5;
  const pts = [
    { x: rc.x + e, y: rc.y + e }, { x: rc.x + rc.w - e, y: rc.y + e }, { x: rc.x + e, y: rc.y + rc.h - e }, { x: rc.x + rc.w - e, y: rc.y + rc.h - e },
    { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 },
  ];
  return pts.every((p) => pointInPoly(p, poly));
}

/**
 * Can the real product go in this room at (or near) its spot? The rule is deliberately simple:
 *   1. it must not be longer than the wall it stands against, and must stay inside the room;
 *   2. it must not block a door.
 * The planned spot from the layout is only a starting point, not a size limit. If the product is wider
 * than the spot, we slide it along its wall (or nudge a free-standing piece) to the nearest place that
 * satisfies both rules. Touching a neighbouring piece is reported as a note, not as a failure.
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
  const rectAt = (cx: number, cy: number) => footprint({ ...item, cx, cy }, real, g);
  const blocksDoor = (rc: Rect) => !FLAT.has(proxy.category) && g.doors.some((dr) => rectsOverlap(rc, dr.zone));
  const ws = item.wall !== null ? g.walls[item.wall] : undefined;

  // Rule 1a: not longer than its wall; not deeper than the room is across.
  if (ws) {
    const wallLen = ws.s1 - ws.s0;
    if (W > wallLen + 1) return { level: "warn", text: `${r(W - wallLen)} cm longer than this ${r(wallLen)} cm wall — it won't fit here.` };
    const across = ws.axis === "h" ? g.length : g.width;
    if (D > across - 1) return { level: "warn", text: `${r(D)} cm deep — deeper than the room is across (${r(across)} cm).${guessNote}` };
  }

  // Candidate spots: along the wall in 5 cm steps, or small nudges for a free-standing piece. Nearest first.
  const cands: { cx: number; cy: number; dist: number }[] = [];
  if (ws) {
    const t0 = ws.axis === "h" ? item.cx : item.cy;
    for (let t = ws.s0 + W / 2; t <= ws.s1 - W / 2 + 0.01; t += 5) cands.push({ cx: ws.axis === "h" ? t : item.cx, cy: ws.axis === "h" ? item.cy : t, dist: Math.abs(t - t0) });
    // Keep the exact planned centre as an option when it is valid.
    if (t0 - W / 2 >= ws.s0 - 0.5 && t0 + W / 2 <= ws.s1 + 0.5) cands.push({ cx: item.cx, cy: item.cy, dist: 0 });
  } else {
    for (let dx = -60; dx <= 60; dx += 10) for (let dy = -60; dy <= 60; dy += 10) cands.push({ cx: item.cx + dx, cy: item.cy + dy, dist: Math.hypot(dx, dy) });
  }
  cands.sort((a, b) => a.dist - b.dist);
  const inRoom = cands.filter((c) => insideRoom(rectAt(c.cx, c.cy), g.poly));
  if (!inRoom.length) return { level: "warn", text: ws ? `Doesn't fit along this wall.${guessNote}` : `Too big for the open floor in this room.${guessNote}` };
  const best = inRoom.find((c) => !blocksDoor(rectAt(c.cx, c.cy)));
  if (!best) return { level: "warn", text: `Would block the door wherever it goes on this ${ws ? "wall" : "spot"}.${guessNote}` };

  // Neighbours it would touch (only a hint: those can usually be moved).
  const rc = rectAt(best.cx, best.cy);
  const touching = FLAT.has(proxy.category)
    ? []
    : ctx.others
        .filter((o) => o.uid !== item.uid)
        .map((o) => ({ o, p: getProduct(o.productId) }))
        .filter(({ o, p }) => !FLAT.has(p.category) && rectsOverlap(rc, footprint(o, p, g)))
        .map(({ p }) => (p.category === "custom" ? p.name : CATEGORY_MAP[p.category].label.toLowerCase()));
  const counts = touching.reduce<Record<string, number>>((m, n) => ((m[n] = (m[n] ?? 0) + 1), m), {});
  const uniq = Object.entries(counts).map(([n, c]) => (c > 1 ? `${c} ${n}s` : n));
  const moved = best.dist > 4 ? ` Slide it about ${r(best.dist)} cm along the ${ws ? "wall" : "floor"} from the planned spot.` : "";
  return {
    level: "ok",
    text: `Fits: inside the room and clear of the door.${moved}${guessNote}`,
    at: { cx: best.cx, cy: best.cy },
    note: uniq.length ? `It would touch the ${uniq.length > 1 ? `${uniq.slice(0, -1).join(", ")} and ${uniq[uniq.length - 1]}` : uniq[0]} — move ${touching.length > 1 ? "them" : "it"} a little.` : undefined,
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
