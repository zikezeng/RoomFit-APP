// Deterministic constraint-based layout solver + validator for polygon rooms. Units: cm.
import { distToPolyEdges, pointInPoly, RoomGeom, WallSeg } from "./apartment";
import { CATEGORIES, CATEGORY_MAP, getProduct, productsIn } from "./catalog";
import { styleScore } from "./ranking";
import { CategoryId, Check, Facing, Layout, Need, PlacedItem, Product, Pt, Rect, StylePrefs } from "./types";

export const CLEARANCE = { walkway: 80, legroom: 45, minLegroom: 35, reach: 20, chairPull: 55 };
const NON_BLOCKING = new Set<CategoryId>(["rug", "mattress"]);
const NO_REACH = new Set<CategoryId>(["side_table", "floor_lamp", "dining_chair", "study_chair", "nightstand", "planter", "mattress", "ottoman", "rug", "floor_mirror"]);

export const rectsOverlap = (a: Rect, b: Rect, eps = 0.5) => a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
export function pointRectDist(px: number, py: number, r: Rect) {
  return Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));
}
export function rectGap(a: Rect, b: Rect) {
  return Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)));
}
function rectInPoly(r: Rect, poly: Pt[]) {
  const s = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  const corners = [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x, y: s.y + s.h },
    { x: s.x + s.w, y: s.y + s.h },
  ];
  if (!corners.every((c) => pointInPoly(c, poly))) return false;
  if (poly.some((v) => v.x > s.x && v.x < s.x + s.w && v.y > s.y && v.y < s.y + s.h)) return false;
  // No wall segment (e.g. an angled wall or a thin notch) may cut through the footprint.
  return !poly.some((a, i) => segCrossesRect(a, poly[(i + 1) % poly.length], s));
}
/** Liang–Barsky: does segment ab pass through the open interior of r? */
function segCrossesRect(a: Pt, b: Pt, r: Rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - r.x) && clip(dx, r.x + r.w - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.h - a.y) && t1 - t0 > 1e-6;
}
function segNearRect(a: Pt, b: Pt, r: Rect, d: number) {
  for (let k = 0; k <= 8; k++) if (pointRectDist(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8, r) <= d) return true;
  return false;
}

export const wallFacing = (ws: WallSeg): Facing => (ws.axis === "h" ? (ws.n === 1 ? "down" : "up") : ws.n === 1 ? "right" : "left");
const OPPOSITE: Record<Facing, Facing> = { up: "down", down: "up", left: "right", right: "left" };

export function footprint(item: PlacedItem, p: Product, g: RoomGeom): Rect {
  const horiz = item.facing === "up" || item.facing === "down";
  const w = horiz ? p.width : p.depth;
  const h = horiz ? p.depth : p.width;
  let { cx, cy } = item;
  const ws = item.wall !== null ? g.walls[item.wall] : undefined;
  if (ws) {
    if (ws.axis === "h") cy = ws.c + (ws.n * h) / 2;
    else cx = ws.c + (ws.n * w) / 2;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const label = (p: Product) => (p.category === "custom" ? p.name : CATEGORY_MAP[p.category].label.toLowerCase());

interface Placed {
  item: PlacedItem;
  rect: Rect;
  p: Product;
}

function localProblem(g: RoomGeom, it: PlacedItem, p: Product, placed: Placed[]): string | null {
  const r = footprint(it, p, g);
  if (!rectInPoly(r, g.poly)) return "does not fit inside the room boundary";
  if (g.doors.some((d) => rectsOverlap(r, d.zone))) return "would block a door";
  if (!NON_BLOCKING.has(p.category)) {
    for (const o of g.obstacles) if (rectsOverlap(r, o.rect)) return `would overlap the ${o.label.toLowerCase()}`;
    for (const o of placed) if (!NON_BLOCKING.has(o.p.category) && rectsOverlap(r, o.rect)) return `would overlap the ${label(o.p)}`;
  }
  if (p.height > 100 && g.windows.some((w) => segNearRect(w.a, w.b, r, 15))) return "would cover a window";
  return null;
}

const mk = (uid: string, p: Product, facing: Facing, cx: number, cy: number, wall: number | null): PlacedItem => ({ uid, category: p.category, productId: p.id, facing, cx, cy, wall });

function scanWall(g: RoomGeom, uid: string, p: Product, ws: WallSeg, prefT: number, placed: Placed[], probe: Product = p): PlacedItem | null {
  const steps = Math.ceil((ws.s1 - ws.s0) / 10) * 2 + 2;
  for (let k = 0; k <= steps; k++) {
    const t = prefT + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 10;
    if (t - p.width / 2 < ws.s0 - 0.5 || t + p.width / 2 > ws.s1 + 0.5) continue;
    const it = mk(uid, p, wallFacing(ws), ws.axis === "h" ? t : 0, ws.axis === "h" ? 0 : t, ws.id);
    if (!localProblem(g, { ...it, productId: probe.id }, probe, placed)) return it;
  }
  return null;
}

function freeItem(g: RoomGeom, uid: string, p: Product, ws: WallSeg, along: number, perp: number, facing: Facing, placed: Placed[]) {
  for (const da of [0, 10, -10, 20, -20, 30, -30]) {
    for (const dp of [0, 10, -10, 20]) {
      const a = along + da;
      const d = perp + dp;
      const it = ws.axis === "h" ? mk(uid, p, facing, a, ws.c + ws.n * d, null) : mk(uid, p, facing, ws.c + ws.n * d, a, null);
      if (!localProblem(g, it, p, placed)) return it;
    }
  }
  return null;
}

// ---------------- Validation ----------------

/** Main rooms keep an 80 cm walkway; compact secondary spaces (balcony, closet, hallway, kitchen) use 60 cm. */
export const walkwayFor = (kind: RoomGeom["kind"]) => (kind === "living" || kind === "bedroom" || kind === "dining" ? CLEARANCE.walkway : 60);

function walkway(g: RoomGeom, placed: Placed[]): { ok: boolean; detail: string } {
  const cw = walkwayFor(g.kind);
  const R = cw / 2;
  const step = 10;
  const nx = Math.max(1, Math.floor(g.width / step));
  const ny = Math.max(1, Math.floor(g.length / step));
  const obs = [...placed.filter((o) => !NON_BLOCKING.has(o.p.category)).map((o) => o.rect), ...g.obstacles.map((o) => o.rect)];
  const free = new Uint8Array(nx * ny);
  const cell = (n: number): Pt => ({ x: ((n % nx) + 0.5) * step, y: (Math.floor(n / nx) + 0.5) * step });
  for (let n = 0; n < nx * ny; n++) {
    const c = cell(n);
    if (pointInPoly(c, g.poly) && distToPolyEdges(c, g.poly) >= R && obs.every((o) => pointRectDist(c.x, c.y, o) >= R)) free[n] = 1;
  }
  const nearestFree = (p: Pt, max: number) => {
    let best = -1;
    let bd = Infinity;
    for (let n = 0; n < nx * ny; n++)
      if (free[n]) {
        const c = cell(n);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd && d <= max) {
          bd = d;
          best = n;
        }
      }
    return best;
  };
  const entries = g.doors.length
    ? g.doors.map((d) => nearestFree({ x: (d.a.x + d.b.x) / 2 + d.n.x * 50, y: (d.a.y + d.b.y) / 2 + d.n.y * 50 }, 40))
    : [nearestFree({ x: g.width / 2, y: g.length / 2 }, Infinity)];
  if (entries.some((e) => e < 0)) return { ok: false, detail: g.doors.length ? `A doorway has no ${cw} cm clear path into the room.` : `No ${cw} cm clear floor area remains.` };
  const seen = new Uint8Array(nx * ny);
  const q = [entries[0]];
  seen[entries[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const i = c % nx;
    const j = (c - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (free[n] && !seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  if (entries.some((e) => !seen[e])) return { ok: false, detail: `The doors are not connected by a ${cw} cm walkway.` };
  const unreached = placed
    .filter((o) => !NO_REACH.has(o.p.category))
    .filter((o) => {
      for (let n = 0; n < nx * ny; n++) if (seen[n] && pointRectDist(cell(n).x, cell(n).y, o.rect) <= R + CLEARANCE.reach) return false;
      return true;
    });
  if (unreached.length) return { ok: false, detail: `No ${cw} cm walkway reaches the ${unreached.map((o) => label(o.p)).join(", ")}.` };
  return { ok: true, detail: g.doors.length ? `A ${cw} cm walkway connects every door to every main piece.` : `A ${cw} cm walkway reaches every main piece.` };
}

export function validateLayout(g: RoomGeom, items: PlacedItem[], budget: number) {
  const placed: Placed[] = items.map((item) => {
    const p = getProduct(item.productId);
    return { item, p, rect: footprint(item, p, g) };
  });
  const total = placed.reduce((s, o) => s + o.p.price, 0);
  const checks: Check[] = [];
  const out = placed.filter((o) => !rectInPoly(o.rect, g.poly));
  checks.push({ id: "bounds", label: "Inside room boundaries", ok: !out.length, detail: out.length ? `Crosses the walls of ${g.label}: ${out.map((o) => o.p.name).join(", ")}.` : `Every piece sits inside the ${g.label} outline.` });
  const overl: string[] = [];
  placed.forEach((a, i) => {
    if (NON_BLOCKING.has(a.p.category)) return;
    g.obstacles.forEach((o) => rectsOverlap(a.rect, o.rect) && overl.push(`${a.p.name} & ${o.label}`));
    placed.slice(i + 1).forEach((b) => {
      if (!NON_BLOCKING.has(b.p.category) && rectsOverlap(a.rect, b.rect)) overl.push(`${a.p.name} & ${b.p.name}`);
    });
  });
  checks.push({ id: "overlap", label: "No overlaps (furniture & fixtures)", ok: !overl.length, detail: overl.length ? `Overlap: ${overl.join("; ")}.` : "No collisions with other pieces or fixed fixtures." });
  const blocking = placed.filter((o) => g.doors.some((d) => rectsOverlap(o.rect, d.zone)));
  checks.push({ id: "door", label: "Door openings clear", ok: !blocking.length, detail: blocking.length ? `Blocking a door swing: ${blocking.map((o) => o.p.name).join(", ")}.` : g.doors.length ? `All ${g.doors.length} door swing area(s) stay clear.` : "No doors marked on this room." });
  const ww = walkway(g, placed);
  const sofa = placed.find((o) => o.p.category === "sofa");
  const ct = placed.find((o) => o.p.category === "coffee_table");
  let legOk = true;
  let legDetail = "";
  if (sofa && ct) {
    const gap = Math.round(rectGap(sofa.rect, ct.rect));
    legOk = gap >= CLEARANCE.minLegroom;
    legDetail = ` Sofa legroom: ${gap} cm (min ${CLEARANCE.minLegroom} cm).`;
  }
  checks.push({ id: "walkway", label: "Walkways & legroom", ok: ww.ok && legOk, detail: ww.detail + legDetail });
  const fitProblems: string[] = [];
  placed.forEach((o) => {
    if (Math.max(o.p.width, o.p.depth) > Math.max(g.width, g.length)) fitProblems.push(`${o.p.name} is larger than the room`);
    if (o.p.height > 100 && g.windows.some((w) => segNearRect(w.a, w.b, o.rect, 15))) fitProblems.push(`${o.p.name} covers a window`);
  });
  const bed = placed.find((o) => o.p.category === "bed_frame");
  const mat = placed.find((o) => o.p.category === "mattress");
  if (mat && (!bed || mat.p.width > bed.p.width || mat.p.depth > bed.p.depth)) fitProblems.push(`${mat.p.name} does not fit ${bed ? bed.p.name : "a bed frame"}`);
  checks.push({ id: "fit", label: "Physically fits", ok: !fitProblems.length, detail: fitProblems.length ? fitProblems.join("; ") + "." : "Real dimensions fit; windows stay clear." });
  checks.push({ id: "budget", label: "Within budget", ok: total <= budget, detail: total <= budget ? `$${total.toLocaleString()} of $${budget.toLocaleString()}.` : `Over budget by $${(total - budget).toLocaleString()}.` });
  return { checks, total, valid: checks.every((c) => c.ok) };
}

// ---------------- Generation ----------------

interface Strategy {
  name: string;
  tagline: string;
  rank: number; // which wall (by length) anchors the main piece
  armSide: 1 | -1;
  shift: number;
  pref: "compact" | "style" | "value";
}

const POOLS: Record<"living" | "bedroom" | "other", Strategy[]> = {
  living: [
    { name: "Open & Airy", tagline: "Compact pieces keep a wide, open walkway.", rank: 0, armSide: 1, shift: 0, pref: "compact" },
    { name: "Cozy & Balanced", tagline: "A conversation group gathered around the coffee table.", rank: 1, armSide: 1, shift: 0, pref: "style" },
    { name: "Functional & Flexible", tagline: "Best-value picks with storage along the free walls.", rank: 2, armSide: -1, shift: 0, pref: "value" },
    { name: "Open & Airy", tagline: "Sofa shifted off-centre to free the main path.", rank: 0, armSide: -1, shift: 40, pref: "compact" },
    { name: "Cozy & Balanced", tagline: "Off-centre seating with a reading nook.", rank: 1, armSide: -1, shift: -40, pref: "style" },
    { name: "Functional & Flexible", tagline: "Seating on a secondary wall, storage elsewhere.", rank: 3, armSide: 1, shift: 30, pref: "value" },
  ],
  bedroom: [
    { name: "Restful & Open", tagline: "Bed on the longest wall with clear circulation.", rank: 0, armSide: 1, shift: 0, pref: "compact" },
    { name: "Cozy Retreat", tagline: "Style-first picks around a centred bed.", rank: 1, armSide: 1, shift: 0, pref: "style" },
    { name: "Work & Rest", tagline: "Best-value bed with room for a study corner.", rank: 2, armSide: -1, shift: 0, pref: "value" },
    { name: "Restful & Open", tagline: "Bed shifted to widen the wardrobe zone.", rank: 0, armSide: -1, shift: 40, pref: "compact" },
    { name: "Cozy Retreat", tagline: "Alternative bed wall for morning light.", rank: 1, armSide: -1, shift: -40, pref: "style" },
    { name: "Work & Rest", tagline: "Desk-friendly arrangement on a secondary wall.", rank: 3, armSide: 1, shift: 30, pref: "value" },
  ],
  other: [
    { name: "Open & Airy", tagline: "Compact pieces along the walls keep the floor open.", rank: 0, armSide: 1, shift: 0, pref: "compact" },
    { name: "Balanced", tagline: "Style-first picks spread across the main walls.", rank: 1, armSide: 1, shift: 0, pref: "style" },
    { name: "Storage First", tagline: "Best-value pieces that maximise storage.", rank: 2, armSide: -1, shift: 0, pref: "value" },
    { name: "Open & Airy", tagline: "Pieces start from a different wall for a clearer path.", rank: 1, armSide: -1, shift: 40, pref: "compact" },
    { name: "Balanced", tagline: "Alternative arrangement on a secondary wall.", rank: 2, armSide: -1, shift: -40, pref: "style" },
    { name: "Storage First", tagline: "Storage moved to the longest free wall.", rank: 3, armSide: 1, shift: 30, pref: "value" },
  ],
};

export interface GenInput {
  geom: RoomGeom;
  needs: Partial<Record<CategoryId, Need>>;
  customItems: Product[];
  prefs: StylePrefs;
  budget: number;
  allocations: Partial<Record<CategoryId, number>>;
  categoryBudgets?: Partial<Record<CategoryId, number>>; // total dollars for all units in a category
  seed: number;
}

export function perUnitAllocation(needs: GenInput["needs"], allocations: GenInput["allocations"], budget: number) {
  const sel = CATEGORIES.filter((c) => (needs[c.id]?.qty ?? 0) > 0);
  const sum = sel.reduce((s, c) => s + (allocations[c.id] ?? c.defaultPct) * needs[c.id]!.qty, 0) || 1;
  return Object.fromEntries(sel.map((c) => [c.id, (budget * (allocations[c.id] ?? c.defaultPct)) / sum])) as Record<CategoryId, number>;
}

function candidates(cat: CategoryId, prefs: StylePrefs, pref: Strategy["pref"], alloc: number, variant: number) {
  const key = (p: Product) => {
    const s = styleScore(p, prefs);
    if (pref === "compact") return s * 100 - (p.width * p.depth) / 100;
    if (pref === "value") return s * 60 - p.price / 5;
    return s * 100 - Math.abs(p.price - alloc) / 10;
  };
  const all = productsIn(cat);
  const inCap = all.filter((p) => p.price <= alloc * 1.25).sort((a, b) => key(b) - key(a));
  const rest = all.filter((p) => p.price > alloc * 1.25).sort((a, b) => a.price - b.price);
  const list = [...inCap, ...rest];
  const v = variant % Math.min(3, list.length);
  if (v) list.unshift(...list.splice(v, 1));
  return list;
}

const ORDER: CategoryId[] = ["sofa", "bed_frame", "tv_stand", "coffee_table", "nightstand", "armchair", "side_table", "floor_lamp", "dining_table", "dining_chair", "wardrobe", "dresser", "desk", "study_chair", "shoe_cabinet", "cabinet", "bookshelf", "console_table", "ottoman", "bench", "floor_mirror", "planter", "custom", "mattress", "rug"];

function solveStrategy(st: Strategy, input: GenInput, variant: number, id: string, letter: string): Layout {
  const { geom: g, needs, prefs, budget } = input;
  const fail = (msg: string, sug: string): Layout => ({ id, name: `Layout ${letter} — ${st.name}`, tagline: st.tagline, valid: false, items: [], total: 0, checks: [], problems: [msg], suggestions: [sug] });
  const sortedWalls = [...g.walls].sort((a, b) => b.s1 - b.s0 - (a.s1 - a.s0));
  if (!sortedWalls.length) return fail("No straight walls were found in this room outline.", "Adjust the room polygon so its walls are horizontal/vertical.");
  const customTotal = input.customItems.reduce((s, p) => s + p.price, 0);
  const defaultAlloc = perUnitAllocation(needs, input.allocations, Math.max(0, budget - customTotal));
  const alloc = { ...defaultAlloc };
  // Explicit user targets are independent, but final layouts still obey the room cap.
  for (const [id, dollars] of Object.entries(input.categoryBudgets ?? {})) {
    const qty = needs[id as CategoryId]?.qty ?? 0;
    if (qty > 0 && typeof dollars === "number" && Number.isFinite(dollars)) {
      alloc[id as CategoryId] = Math.max(0, dollars) / qty;
    }
  }
  const units: { uid: string; cat: CategoryId; idx: number; cands: Product[]; pick: number }[] = [];
  ORDER.forEach((cat) => {
    if (cat === "custom") return input.customItems.forEach((p) => units.push({ uid: `custom-${p.id}`, cat, idx: 0, cands: [p], pick: 0 }));
    const n = needs[cat]?.qty ?? 0;
    for (let i = 0; i < n; i++) units.push({ uid: `${cat}-${i}`, cat, idx: i, cands: candidates(cat, prefs, st.pref, alloc[cat], variant + i), pick: 0 });
  });
  const total = () => units.reduce((s, u) => s + u.cands[u.pick].price, 0);
  let guard = 300;
  while (total() > budget && guard--) {
    const sorted = [...units].sort((a, b) => b.cands[b.pick].price - a.cands[a.pick].price);
    const u = sorted.find((x) => x.cands.some((p) => p.price < x.cands[x.pick].price));
    if (!u) break;
    u.pick = u.cands.findIndex((p) => p.price < u.cands[u.pick].price);
  }
  const problems: string[] = [];
  const suggestions: string[] = [];
  if (total() > budget) {
    const min = units.reduce((s, u) => s + Math.min(...u.cands.map((p) => p.price)), 0);
    problems.push(`Even the cheapest matching pieces cost $${min.toLocaleString()}, above your $${budget.toLocaleString()} budget.`);
    suggestions.push(`Raise the budget to at least $${min.toLocaleString()} or remove optional items.`);
  }
  const placed: Placed[] = [];
  let S = sortedWalls[st.rank % sortedWalls.length];
  const isH = () => S.axis === "h";
  const get = (cat: CategoryId) => placed.find((o) => o.p.category === cat);
  const alongOf = (r: Rect) => (isH() ? r.x + r.w / 2 : r.y + r.h / 2);
  const perpOf = (r: Rect) => (isH() ? (r.y + r.h / 2 - S.c) * S.n : (r.x + r.w / 2 - S.c) * S.n);
  const spanOf = (r: Rect) => (isH() ? r.w : r.h);
  const mid = () => (S.s0 + S.s1) / 2;
  const storage = [...sortedWalls.slice((st.rank + 1) % sortedWalls.length), ...sortedWalls.slice(0, (st.rank + 1) % sortedWalls.length)];
  const qty = (c: CategoryId) => needs[c]?.qty ?? 0;
  const sideFacing = (side: number): Facing => (isH() ? (side > 0 ? "left" : "right") : side > 0 ? "up" : "down");

  const placeOne = (u: (typeof units)[number], p: Product): PlacedItem | null => {
    const main = get("sofa") ?? get("bed_frame");
    const anchor = main;
    const ct = get("coffee_table");
    // Bed-relative pieces use the bed's own wall (in a studio the bed may not sit on the main wall).
    const bedRel = (perp: (bed: Placed) => number) => {
      const bed = get("bed_frame");
      if (!bed) return null;
      const bw = bed.item.wall !== null ? g.walls[bed.item.wall] : S;
      const along = bw.axis === "h" ? bed.rect.x + bed.rect.w / 2 : bed.rect.y + bed.rect.h / 2;
      return freeItem(g, u.uid, p, bw, along, perp(bed), wallFacing(bw), placed);
    };
    const anyWall = (probe: Product = p) => {
      for (const w of storage) {
        const r = scanWall(g, u.uid, p, w, w.s0 + p.width / 2 + 10, placed, probe);
        if (r) return r;
      }
      return null;
    };
    const withChair = (chairCat: CategoryId) => (qty(chairCat) ? { ...p, depth: p.depth + CLEARANCE.chairPull } : p);
    switch (u.cat) {
      case "sofa":
      case "bed_frame":
        return scanWall(g, u.uid, p, S, mid() + st.shift, placed) ?? anyWall();
      case "tv_stand": {
        const c = anchor ? alongOf(anchor.rect) : mid();
        const opp = g.walls
          .filter((w) => w.axis === S.axis && w.n === -S.n && (w.c - S.c) * S.n > 150)
          .sort((a, b) => Number(!(c >= a.s0 && c <= a.s1)) - Number(!(c >= b.s0 && c <= b.s1)) || Math.abs(a.c - S.c) - Math.abs(b.c - S.c));
        for (const w of opp) {
          const r = scanWall(g, u.uid, p, w, c, placed);
          if (r) return r;
        }
        return anyWall();
      }
      case "coffee_table":
        if (anchor) return freeItem(g, u.uid, p, S, alongOf(anchor.rect), anchor.p.depth + CLEARANCE.legroom + p.depth / 2, wallFacing(S), placed);
        return freeItem(g, u.uid, p, S, mid(), 150, wallFacing(S), placed);
      case "armchair":
      case "ottoman": {
        if (ct) {
          const first = u.cat === "armchair" ? st.armSide : -st.armSide;
          for (const side of u.idx === 0 ? [first, -first] : [-first, first]) {
            const along = alongOf(ct.rect) + side * (spanOf(ct.rect) / 2 + CLEARANCE.legroom + p.depth / 2);
            const r = freeItem(g, u.uid, p, S, along, perpOf(ct.rect), sideFacing(side), placed);
            if (r) return r;
          }
        }
        return anyWall();
      }
      case "side_table":
      case "nightstand":
      case "floor_lamp": {
        const anchor = u.cat === "nightstand" ? (get("bed_frame") ?? main) : main;
        if (anchor) {
          const aw = anchor.item.wall !== null ? g.walls[anchor.item.wall] : S;
          const aAlong = aw.axis === "h" ? anchor.rect.x + anchor.rect.w / 2 : anchor.rect.y + anchor.rect.h / 2;
          const aSpan = aw.axis === "h" ? anchor.rect.w : anchor.rect.h;
          const sides = u.cat === "floor_lamp" ? [st.armSide, -st.armSide] : u.idx === 0 ? [-st.armSide, st.armSide] : [st.armSide, -st.armSide];
          for (const s of sides) {
            const r = scanWall(g, u.uid, p, aw, aAlong + s * (aSpan / 2 + p.width / 2), placed);
            if (r && rectGap(footprint(r, p, g), anchor.rect) < 60) return r;
          }
        }
        return anyWall();
      }
      case "dining_table":
        return anyWall(withChair("dining_chair"));
      case "desk":
        return anyWall(withChair("study_chair"));
      case "dining_chair":
      case "study_chair": {
        const t = get(u.cat === "dining_chair" ? "dining_table" : "desk");
        if (!t || t.item.wall === null) return anyWall();
        const tw = g.walls[t.item.wall];
        const tH = tw.axis === "h";
        const tAlong = tH ? t.rect.x + t.rect.w / 2 : t.rect.y + t.rect.h / 2;
        const tSpan = tH ? t.rect.w : t.rect.h;
        const slots = u.cat === "study_chair" ? 1 : Math.max(1, Math.floor(tSpan / 50));
        const free = (along: number, perp: number, facing: Facing) => {
          const it = tH ? mk(u.uid, p, facing, along, tw.c + tw.n * perp, null) : mk(u.uid, p, facing, tw.c + tw.n * perp, along, null);
          return localProblem(g, it, p, placed) ? null : it;
        };
        if (u.idx < slots) return free(tAlong - tSpan / 2 + ((u.idx + 0.5) * tSpan) / slots, t.p.depth + p.depth / 2, OPPOSITE[wallFacing(tw)]);
        const side = (u.idx - slots) % 2 ? -1 : 1;
        const facing: Facing = tH ? (side > 0 ? "left" : "right") : side > 0 ? "up" : "down";
        return free(tAlong + side * (tSpan / 2 + p.depth / 2), t.p.depth / 2, facing);
      }
      case "shoe_cabinet": {
        const d = g.doors[0];
        if (d) {
          const dm = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
          const near = [...g.walls].sort((a, b) => Math.abs((a.axis === "h" ? dm.y : dm.x) - a.c) - Math.abs((b.axis === "h" ? dm.y : dm.x) - b.c));
          for (const w of near) {
            const r = scanWall(g, u.uid, p, w, w.axis === "h" ? dm.x : dm.y, placed);
            if (r) return r;
          }
        }
        return anyWall();
      }
      case "bench": {
        const r = bedRel((bed) => bed.p.depth + p.depth / 2 + 5);
        return r ?? anyWall();
      }
      case "mattress": {
        const bed = get("bed_frame");
        if (!bed || p.width > bed.p.width || p.depth > bed.p.depth) return null;
        return bedRel(() => bed.p.depth - p.depth / 2 - 2);
      }
      case "rug": {
        if (ct) return freeItem(g, u.uid, p, S, alongOf(ct.rect), perpOf(ct.rect), wallFacing(S), placed);
        if (get("bed_frame")) return bedRel((bed) => bed.p.depth * 0.65);
        const table = get("dining_table");
        if (table) {
          const c = { x: table.rect.x + table.rect.w / 2, y: table.rect.y + table.rect.h / 2 };
          return freeItem(g, u.uid, p, S, isH() ? c.x : c.y, isH() ? (c.y - S.c) * S.n : (c.x - S.c) * S.n, wallFacing(S), placed);
        }
        return freeItem(g, u.uid, p, S, mid(), (isH() ? g.length : g.width) / 2, wallFacing(S), placed);
      }
      default:
        return anyWall();
    }
  };

  for (const u of units) {
    let it: PlacedItem | null = null;
    const tried = [u.pick, ...u.cands.map((_, i) => i).filter((i) => i !== u.pick)];
    for (const i of tried) {
      const p = u.cands[i];
      if (i !== u.pick && total() - u.cands[u.pick].price + p.price > budget) continue;
      it = placeOne(u, p);
      if (it) {
        u.pick = i;
        break;
      }
    }
    if (it) {
      if ((u.cat === "sofa" || u.cat === "bed_frame") && it.wall !== null && !(u.cat === "bed_frame" && get("sofa"))) S = g.walls[it.wall];
      placed.push({ item: it, p: u.cands[u.pick], rect: footprint(it, u.cands[u.pick], g) });
    }
    else {
      const name = u.cat === "custom" ? u.cands[0].name : CATEGORY_MAP[u.cat].label.toLowerCase();
      problems.push(`No ${name} option could be placed inside the ${g.label} without crossing walls, overlapping, or blocking doors/windows.`);
      suggestions.push(`Remove the ${name} or choose fewer pieces for this room.`);
    }
  }
  const items = placed.map((o) => o.item);
  const v = validateLayout(g, items, budget);
  if (!problems.length && !v.valid) {
    v.checks.filter((c) => !c.ok).forEach((c) => problems.push(c.detail));
    suggestions.push("Remove an optional piece or choose smaller furniture.");
  }
  return { id, name: `Layout ${letter} — ${st.name}`, tagline: st.tagline, valid: !problems.length && v.valid, items, total: v.total, checks: v.checks, problems, suggestions };
}

export function generateLayouts(input: GenInput): Layout[] {
  const k = input.geom.kind;
  const pool = POOLS[k === "bedroom" ? "bedroom" : k === "living" ? "living" : "other"];
  const start = (input.seed * 3) % pool.length;
  const variant = Math.floor(input.seed / 2);
  return [0, 1, 2].map((i) => {
    const st = pool[(start + i) % pool.length];
    const flip = st.armSide === 1 ? -1 : 1;
    const tries: Strategy[] = [st, { ...st, armSide: flip }, { ...st, shift: st.shift + 40 }, { ...st, shift: st.shift - 40 }, { ...st, pref: "compact" }, { ...st, pref: "compact", armSide: flip }, { ...st, rank: st.rank + 1 }, { ...st, rank: st.rank + 2, pref: "compact" }];
    let first: Layout | null = null;
    for (const t of tries) {
      const l = solveStrategy(t, input, variant, `s${input.seed}-${i}`, "ABC"[i]);
      if (l.valid) return l;
      first = first ?? l;
    }
    return first!;
  });
}

// ---------------- Swapping ----------------

export function trySwap(g: RoomGeom, items: PlacedItem[], uid: string, productId: string, budget: number) {
  const next = items.map((i) => (i.uid === uid ? { ...i, productId } : i));
  return { items: next, ...validateLayout(g, next, budget) };
}

export function alternativesFor(g: RoomGeom, items: PlacedItem[], uid: string, budget: number, prefs: StylePrefs) {
  const cur = items.find((i) => i.uid === uid)!;
  const curP = getProduct(cur.productId);
  if (cur.category === "custom") return [];
  return productsIn(cur.category)
    .filter((p) => p.id !== cur.productId)
    .map((p) => {
      const r = trySwap(g, items, uid, p.id, budget);
      return { product: p, ok: r.valid, reason: r.checks.find((c) => !c.ok)?.detail ?? "", delta: p.price - curP.price, score: styleScore(p, prefs) };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score || a.product.price - b.product.price);
}
