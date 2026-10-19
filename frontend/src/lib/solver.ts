// Deterministic constraint-based layout solver + validator. Units: cm.
import { CATEGORIES, CATEGORY_MAP, PRODUCT_MAP, productsIn } from "./catalog";
import { doorZone, insideRoom, openingRect, pointRectDist, rectGap, rectsOverlap, wallLength } from "./geometry";
import { styleScore } from "./ranking";
import { CategoryId, Check, Facing, Layout, Need, PlacedItem, Product, Rect, Room, StylePrefs, Wall } from "./types";

export const CLEARANCE = { walkway: 80, legroom: 45, minLegroom: 35, reach: 20 };

const FACING_FOR_WALL: Record<Wall, Facing> = { top: "down", bottom: "up", left: "right", right: "left" };
const OPP: Record<Wall, Wall> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const isHoriz = (w: Wall) => w === "top" || w === "bottom";

export function footprint(item: PlacedItem, p: Product, room: Room): Rect {
  const horiz = item.facing === "up" || item.facing === "down";
  const w = horiz ? p.width : p.depth;
  const h = horiz ? p.depth : p.width;
  let { cx, cy } = item;
  if (item.wall === "top") cy = h / 2;
  else if (item.wall === "bottom") cy = room.length - h / 2;
  else if (item.wall === "left") cx = w / 2;
  else if (item.wall === "right") cx = room.width - w / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const label = (p: Product) => CATEGORY_MAP[p.category].label.toLowerCase();

interface Placed {
  item: PlacedItem;
  rect: Rect;
  p: Product;
}

function localProblem(room: Room, item: PlacedItem, p: Product, placed: Placed[]): string | null {
  const r = footprint(item, p, room);
  if (!insideRoom(r, room)) return "does not fit inside the room";
  if (rectsOverlap(r, doorZone(room))) return "would block the door swing";
  if (p.category !== "rug") {
    for (const o of placed) if (o.p.category !== "rug" && rectsOverlap(r, o.rect)) return `would overlap the ${label(o.p)}`;
  }
  if (p.height > 100 && item.wall) {
    for (const w of room.windows) if (w.wall === item.wall && rectsOverlap(r, openingRect(room, w, 10))) return "would cover a window";
  }
  return null;
}

function wallItem(uid: string, p: Product, wall: Wall, t: number): PlacedItem {
  const h = isHoriz(wall);
  return { uid, category: p.category, productId: p.id, wall, facing: FACING_FOR_WALL[wall], cx: h ? t : 0, cy: h ? 0 : t };
}

function scanWall(room: Room, uid: string, p: Product, wall: Wall, prefT: number, placed: Placed[]): PlacedItem | null {
  const len = wallLength(room, wall);
  const steps = Math.ceil(len / 10) * 2 + 2;
  for (let k = 0; k <= steps; k++) {
    const t = prefT + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 10;
    if (t - p.width / 2 < 0 || t + p.width / 2 > len) continue;
    const it = wallItem(uid, p, wall, t);
    if (!localProblem(room, it, p, placed)) return it;
  }
  return null;
}

/** Place a free-standing item centred at along/perp coords relative to an anchor wall, nudging if needed. */
function freeItem(room: Room, uid: string, p: Product, wall: Wall, along: number, perp: number, facing: Facing, placed: Placed[]) {
  for (const da of [0, 10, -10, 20, -20, 30, -30]) {
    for (const dp of [0, 10, -10, 20]) {
      const a = along + da;
      const d = perp + dp;
      const pos =
        wall === "top" ? { cx: a, cy: d } : wall === "bottom" ? { cx: a, cy: room.length - d } : wall === "left" ? { cx: d, cy: a } : { cx: room.width - d, cy: a };
      const it: PlacedItem = { uid, category: p.category, productId: p.id, wall: null, facing, ...pos };
      if (!localProblem(room, it, p, placed)) return it;
    }
  }
  return null;
}

// ---------------- Validation ----------------

function walkway(room: Room, placed: Placed[]): { ok: boolean; detail: string } {
  const R = CLEARANCE.walkway / 2;
  const step = 10;
  const nx = Math.floor(room.width / step);
  const ny = Math.floor(room.length / step);
  const obs = placed.filter((o) => o.p.category !== "rug");
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const px = (i + 0.5) * step;
      const py = (j + 0.5) * step;
      if (px < R || py < R || px > room.width - R || py > room.length - R) continue;
      if (obs.every((o) => pointRectDist(px, py, o.rect) >= R)) free[j * nx + i] = 1;
    }
  const d = room.door;
  const t = d.at * wallLength(room, d.wall);
  const [sx, sy] =
    d.wall === "top" ? [t, 50] : d.wall === "bottom" ? [t, room.length - 50] : d.wall === "left" ? [50, t] : [room.width - 50, t];
  let start = -1;
  let best = Infinity;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      if (free[j * nx + i]) {
        const dist = Math.hypot((i + 0.5) * step - sx, (j + 0.5) * step - sy);
        if (dist < best && dist <= 35) {
          best = dist;
          start = j * nx + i;
        }
      }
  if (start < 0) return { ok: false, detail: "The entrance has no 80 cm clear path into the room." };
  const seen = new Uint8Array(nx * ny);
  const q = [start];
  seen[start] = 1;
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
  const unreached = obs
    .filter((o) => !["side_table", "floor_lamp"].includes(o.p.category))
    .filter((o) => {
      for (let n = 0; n < nx * ny; n++)
        if (seen[n] && pointRectDist(((n % nx) + 0.5) * step, (Math.floor(n / nx) + 0.5) * step, o.rect) <= R + CLEARANCE.reach) return false;
      return true;
    });
  if (unreached.length) return { ok: false, detail: `No 80 cm walkway reaches the ${unreached.map((o) => label(o.p)).join(", ")}.` };
  return { ok: true, detail: "An 80 cm walkway connects the door to every main piece." };
}

export function validateLayout(room: Room, items: PlacedItem[], budget: number) {
  const placed: Placed[] = items.map((item) => {
    const p = PRODUCT_MAP[item.productId];
    return { item, p, rect: footprint(item, p, room) };
  });
  const total = placed.reduce((s, o) => s + o.p.price, 0);
  const checks: Check[] = [];
  const out = placed.filter((o) => !insideRoom(o.rect, room));
  checks.push({ id: "bounds", label: "Inside room boundaries", ok: !out.length, detail: out.length ? `Outside the walls: ${out.map((o) => o.p.name).join(", ")}.` : "Every piece sits within the walls." });
  const overl: string[] = [];
  placed.forEach((a, i) =>
    placed.slice(i + 1).forEach((b) => {
      if (a.p.category !== "rug" && b.p.category !== "rug" && rectsOverlap(a.rect, b.rect)) overl.push(`${a.p.name} & ${b.p.name}`);
    }),
  );
  checks.push({ id: "overlap", label: "No overlapping furniture", ok: !overl.length, detail: overl.length ? `Overlap: ${overl.join("; ")}.` : "No two pieces collide." });
  const dz = doorZone(room);
  const blocking = placed.filter((o) => rectsOverlap(o.rect, dz));
  checks.push({ id: "door", label: "Door opening clear", ok: !blocking.length, detail: blocking.length ? `Blocking the door swing: ${blocking.map((o) => o.p.name).join(", ")}.` : `The ${room.door.width} cm door swings freely.` });
  const ww = walkway(room, placed);
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
  const tooBig = placed.filter((o) => Math.min(o.p.width, o.p.depth) > Math.min(room.width, room.length) || Math.max(o.p.width, o.p.depth) > Math.max(room.width, room.length));
  const winBlock = placed.filter((o) => o.p.height > 100 && o.item.wall && room.windows.some((w) => w.wall === o.item.wall && rectsOverlap(o.rect, openingRect(room, w, 10))));
  checks.push({
    id: "fit",
    label: "Physically fits",
    ok: !tooBig.length && !winBlock.length,
    detail: tooBig.length ? `Too large for this room: ${tooBig.map((o) => o.p.name).join(", ")}.` : winBlock.length ? `Tall piece covers a window: ${winBlock.map((o) => o.p.name).join(", ")}.` : "Every piece's real dimensions fit, windows stay clear.",
  });
  checks.push({ id: "budget", label: "Within budget", ok: total <= budget, detail: total <= budget ? `$${total.toLocaleString()} of $${budget.toLocaleString()}.` : `Over budget by $${(total - budget).toLocaleString()}.` });
  return { checks, total, valid: checks.every((c) => c.ok) };
}

// ---------------- Generation ----------------

interface Strategy {
  name: string;
  tagline: string;
  sofaWall: Wall;
  armSide: 1 | -1;
  shift: number;
  storageWalls: Wall[];
  pref: "compact" | "style" | "value";
}

const POOL: Strategy[] = [
  { name: "Open & Airy", tagline: "Compact pieces keep a wide, open walkway.", sofaWall: "top", armSide: 1, shift: 0, storageWalls: ["left", "right", "bottom", "top"], pref: "compact" },
  { name: "Cozy & Balanced", tagline: "A conversation group gathered around the coffee table.", sofaWall: "left", armSide: 1, shift: 0, storageWalls: ["top", "bottom", "right", "left"], pref: "style" },
  { name: "Functional & Flexible", tagline: "Best-value picks with storage along the free walls.", sofaWall: "right", armSide: -1, shift: 0, storageWalls: ["top", "left", "bottom", "right"], pref: "value" },
  { name: "Open & Airy", tagline: "Sofa faces the window wall for daylight views.", sofaWall: "bottom", armSide: -1, shift: 40, storageWalls: ["left", "right", "top", "bottom"], pref: "compact" },
  { name: "Cozy & Balanced", tagline: "Off-centre seating with a reading nook.", sofaWall: "top", armSide: -1, shift: -40, storageWalls: ["right", "left", "bottom", "top"], pref: "style" },
  { name: "Functional & Flexible", tagline: "Media wall on the right, desk-friendly left side.", sofaWall: "left", armSide: -1, shift: 30, storageWalls: ["bottom", "top", "right", "left"], pref: "value" },
];

export interface GenInput {
  room: Room;
  needs: Record<CategoryId, Need>;
  prefs: StylePrefs;
  budget: number;
  allocations: Record<CategoryId, number>;
  seed: number;
}

export function perUnitAllocation(needs: Record<CategoryId, Need>, allocations: Record<CategoryId, number>, budget: number) {
  const sel = CATEGORIES.filter((c) => needs[c.id]?.qty > 0);
  const sum = sel.reduce((s, c) => s + allocations[c.id] * needs[c.id].qty, 0) || 1;
  return Object.fromEntries(sel.map((c) => [c.id, (budget * allocations[c.id]) / sum])) as Record<CategoryId, number>;
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

const ORDER: CategoryId[] = ["sofa", "tv_stand", "coffee_table", "armchair", "side_table", "floor_lamp", "desk", "bookshelf", "rug"];

function solveStrategy(st: Strategy, input: GenInput, variant: number, id: string, letter: string): Layout {
  const { room, needs, prefs, budget } = input;
  const alloc = perUnitAllocation(needs, input.allocations, budget);
  const units: { uid: string; cat: CategoryId; idx: number; cands: Product[]; pick: number }[] = [];
  ORDER.forEach((cat) => {
    const n = needs[cat]?.qty ?? 0;
    for (let i = 0; i < n; i++) units.push({ uid: `${cat}-${i}`, cat, idx: i, cands: candidates(cat, prefs, st.pref, alloc[cat], variant + i), pick: 0 });
  });
  const total = () => units.reduce((s, u) => s + u.cands[u.pick].price, 0);
  // Budget: downgrade the most expensive piece to the best-ranked cheaper option until within budget.
  let guard = 200;
  while (total() > budget && guard--) {
    const sorted = [...units].sort((a, b) => b.cands[b.pick].price - a.cands[a.pick].price);
    let changed = false;
    for (const u of sorted) {
      const cur = u.cands[u.pick].price;
      const idx = u.cands.findIndex((p) => p.price < cur);
      if (idx >= 0) {
        u.pick = idx;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  const problems: string[] = [];
  const suggestions: string[] = [];
  if (total() > budget) {
    const min = units.reduce((s, u) => s + Math.min(...u.cands.map((p) => p.price)), 0);
    problems.push(`Even the cheapest matching pieces cost $${min.toLocaleString()}, above your $${budget.toLocaleString()} budget.`);
    suggestions.push(`Raise the budget to at least $${min.toLocaleString()} or remove optional items.`);
  }
  const placed: Placed[] = [];
  const S = st.sofaWall;
  const H = isHoriz(S);
  const get = (cat: CategoryId) => placed.find((o) => o.p.category === cat);
  const alongOf = (r: Rect) => (H ? r.x + r.w / 2 : r.y + r.h / 2);
  const perpOf = (r: Rect) => (S === "top" ? r.y + r.h / 2 : S === "bottom" ? room.length - (r.y + r.h / 2) : S === "left" ? r.x + r.w / 2 : room.width - (r.x + r.w / 2));
  const lenS = wallLength(room, S);

  const placeOne = (u: (typeof units)[number], p: Product): PlacedItem | null => {
    const sofa = get("sofa");
    const ct = get("coffee_table");
    const anyWall = (pref: number | null) => {
      for (const w of st.storageWalls) {
        const r = scanWall(room, u.uid, p, w, pref ?? p.width / 2 + 10, placed);
        if (r) return r;
      }
      return null;
    };
    switch (u.cat) {
      case "sofa":
        return scanWall(room, u.uid, p, S, lenS / 2 + st.shift, placed) ?? anyWall(null);
      case "tv_stand":
        return scanWall(room, u.uid, p, OPP[S], sofa ? alongOf(sofa.rect) : lenS / 2, placed) ?? anyWall(null);
      case "coffee_table":
        if (sofa) return freeItem(room, u.uid, p, S, alongOf(sofa.rect), sofa.p.depth + CLEARANCE.legroom + p.depth / 2, FACING_FOR_WALL[S], placed);
        return freeItem(room, u.uid, p, S, lenS / 2, (H ? room.length : room.width) / 2, FACING_FOR_WALL[S], placed);
      case "armchair": {
        if (ct) {
          for (const side of u.idx === 0 ? [st.armSide, -st.armSide] : [-st.armSide, st.armSide]) {
            const along = alongOf(ct.rect) + side * ((H ? ct.rect.w : ct.rect.h) / 2 + CLEARANCE.legroom + p.depth / 2);
            const facing: Facing = H ? (side > 0 ? "left" : "right") : side > 0 ? "up" : "down";
            const r = freeItem(room, u.uid, p, S, along, perpOf(ct.rect), facing, placed);
            if (r) return r;
          }
        }
        return anyWall(null);
      }
      case "side_table":
      case "floor_lamp": {
        if (sofa) {
          const sides = u.cat === "side_table" ? (u.idx === 0 ? [-st.armSide, st.armSide] : [st.armSide, -st.armSide]) : [st.armSide, -st.armSide];
          for (const s of sides) {
            const r = scanWall(room, u.uid, p, S, alongOf(sofa.rect) + s * ((H ? sofa.rect.w : sofa.rect.h) / 2 + p.width / 2), placed);
            if (r && rectGap(footprint(r, p, room), sofa.rect) < 60) return r;
          }
        }
        return anyWall(null);
      }
      case "rug": {
        const c = ct ?? sofa;
        const along = c ? alongOf(c.rect) : lenS / 2;
        const perp = ct ? perpOf(ct.rect) : (H ? room.length : room.width) / 2;
        return freeItem(room, u.uid, p, S, along, perp, FACING_FOR_WALL[S], placed);
      }
      default:
        return anyWall(null);
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
    if (it) placed.push({ item: it, p: u.cands[u.pick], rect: footprint(it, u.cands[u.pick], room) });
    else {
      const meta = CATEGORY_MAP[u.cat];
      problems.push(`No ${meta.label.toLowerCase()} from the catalog could be placed without overlapping, blocking the door/windows or leaving the room.`);
      suggestions.push(`Remove the ${meta.label.toLowerCase()}${meta.defaultPriority === "optional" ? " (optional)" : ""} or try a larger room measurement.`);
    }
  }
  const items = placed.map((o) => o.item);
  const v = validateLayout(room, items, budget);
  if (!problems.length && !v.valid) {
    v.checks.filter((c) => !c.ok).forEach((c) => problems.push(c.detail));
    suggestions.push("Remove an optional piece (e.g. bookshelf or desk) or choose smaller furniture.");
  }
  return { id, name: `Layout ${letter} — ${st.name}`, tagline: st.tagline, valid: !problems.length && v.valid, items, total: v.total, checks: v.checks, problems, suggestions };
}

export function generateLayouts(input: GenInput): Layout[] {
  const start = (input.seed * 3) % POOL.length;
  const variant = Math.floor(input.seed / 2);
  return [0, 1, 2].map((i) => {
    const st = POOL[(start + i) % POOL.length];
    // Repair pass: if constraints fail, deterministically try mirrored / shifted / more compact variants of the same strategy.
    const tries: Strategy[] = [st, { ...st, armSide: st.armSide === 1 ? -1 : 1 }, { ...st, shift: st.shift + 40 }, { ...st, shift: st.shift - 40 }, { ...st, pref: "compact" }, { ...st, pref: "compact", armSide: st.armSide === 1 ? -1 : 1 }];
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

export function trySwap(room: Room, items: PlacedItem[], uid: string, productId: string, budget: number) {
  const next = items.map((i) => (i.uid === uid ? { ...i, productId } : i));
  return { items: next, ...validateLayout(room, next, budget) };
}

export function alternativesFor(room: Room, items: PlacedItem[], uid: string, budget: number, prefs: StylePrefs) {
  const cur = items.find((i) => i.uid === uid)!;
  const curP = PRODUCT_MAP[cur.productId];
  return productsIn(cur.category)
    .filter((p) => p.id !== cur.productId)
    .map((p) => {
      const r = trySwap(room, items, uid, p.id, budget);
      return { product: p, ok: r.valid, reason: r.checks.find((c) => !c.ok)?.detail ?? "", delta: p.price - curP.price, score: styleScore(p, prefs) };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score || a.product.price - b.product.price);
}
