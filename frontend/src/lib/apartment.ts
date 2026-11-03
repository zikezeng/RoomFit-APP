// Apartment (image-space) model → per-room scaled geometry (cm). Works for any uploaded plan.
import { Apartment, HomeType, PlanRoom, Pt, Rect, RoomKind, RoomSpec, Unit, WallOpening } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const ROOM_KINDS: { id: RoomKind; label: string }[] = [
  { id: "living", label: "Living Room" },
  { id: "bedroom", label: "Bedroom" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
  { id: "closet", label: "Walk-in Closet" },
  { id: "balcony", label: "Balcony" },
  { id: "dining", label: "Dining" },
  { id: "hallway", label: "Hallway" },
  { id: "other", label: "Other" },
];
export const KIND_LABEL = Object.fromEntries(ROOM_KINDS.map((k) => [k.id, k.label])) as Record<RoomKind, string>;

export function polyArea(poly: Pt[]) {
  let s = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  });
  return Math.abs(s) / 2;
}
export function centroid(poly: Pt[]): Pt {
  const n = poly.length;
  return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
}
export function bbox(poly: Pt[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
export function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function distToSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export const distToPolyEdges = (p: Pt, poly: Pt[]) => Math.min(...poly.map((a, i) => distToSeg(p, a, poly[(i + 1) % poly.length])));

/** cm per image pixel, or null when uncalibrated. */
export const scaleOf = (ap: Apartment) =>
  ap.autoScale ??
  (ap.calib && dist(ap.calib.a, ap.calib.b) > 0
    ? ap.calib.cm / dist(ap.calib.a, ap.calib.b)
    : null);

export const SQFT_CM2 = 929.0304;

/** Per-room cm/px.
 * If the user manually confirms a room's sq ft,
 * keep the detected room shape but rescale it to match that real-world area.
 */
export const roomScale = (ap: Apartment, room: PlanRoom) => {
  const pxArea = polyArea(room.poly);

  if (room.manualSqft && room.manualSqft > 0 && pxArea > 0) {
    return Math.sqrt((room.manualSqft * SQFT_CM2) / pxArea);
  }

  return scaleOf(ap);
};

export const HOME_TYPES: { id: HomeType; label: string; bed: number; bath: number }[] = [
  { id: "studio", label: "Studio", bed: 0, bath: 1 },
  { id: "1b1b", label: "1B1B", bed: 1, bath: 1 },
  { id: "2b1b", label: "2B1B", bed: 2, bath: 1 },
  { id: "2b2b", label: "2B2B", bed: 2, bath: 2 },
  { id: "3b2b", label: "3B2B", bed: 3, bath: 2 },
];

/** cm/px so that the segmented rooms add up to the apartment size the user entered. */
export const estimateScale = (rooms: PlanRoom[], sqft: number) => {
  const px = rooms.reduce((s, r) => s + polyArea(r.poly), 0);
  return px > 0 ? Math.sqrt((sqft * SQFT_CM2) / px) : null;
};

/** Propose room names from size/shape + home type. Always shown as suggestions for the user to confirm. */
export function guessKinds(polys: Pt[][], home: HomeType): PlanRoom[] {
  const ht = HOME_TYPES.find((h) => h.id === home)!;
  const info = polys.map((poly, i) => {
    const b = bbox(poly);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    return { i, poly, area: polyArea(poly), aspect: Math.max(w, h) / Math.max(1, Math.min(w, h)) };
  });
  const order = [...info].sort((a, b) => b.area - a.area);
  const kinds: RoomKind[] = new Array(polys.length).fill("other");
  const balcony = order.slice(1).find((r) => r.aspect >= 2.3);
  if (balcony) kinds[balcony.i] = "balcony";
  const queue: RoomKind[] = ["living", ...Array(ht.bed).fill("bedroom"), ...Array(ht.bath).fill("bathroom"), "closet"];
  order.forEach((r) => {
    if (kinds[r.i] !== "other") return;
    const k = queue.shift();
    if (k) kinds[r.i] = k;
  });
  const count: Partial<Record<RoomKind, number>> = {};
  return info.map((r) => {
    const k = kinds[r.i];
    count[k] = (count[k] ?? 0) + 1;
    const total = kinds.filter((x) => x === k).length;
    return { id: uid(), kind: k, label: `${KIND_LABEL[k]}${total > 1 ? ` ${count[k]}` : ""}`, poly: r.poly };
  });
}

/** Home-type sanity checks shown in Step 2. */
export function homeTypeWarnings(ap: Apartment): string[] {
  const ht = HOME_TYPES.find((h) => h.id === ap.homeType);
  if (!ht) return [];
  const n = (k: RoomKind) => ap.rooms.filter((r) => r.kind === k).length;
  const out: string[] = [];
  if (ht.bed === 0 && n("bedroom") > 0) out.push("You chose Studio, but a separate Bedroom is marked. Studios usually have one main room — check the labels.");
  if (ht.bed > 0 && n("bedroom") < ht.bed) out.push(`${ht.label} should have ${ht.bed} bedroom(s); ${n("bedroom")} marked.`);
  if (n("bathroom") < ht.bath) out.push(`${ht.label} should have ${ht.bath} bathroom(s); ${n("bathroom")} marked.`);
  if (!n("living")) out.push("No Living Room marked yet.");
  if (ht.id === "studio" && ap.rooms.length >= 5) out.push(`${ap.rooms.length} areas were found for a Studio — check whether the split is accurate.`);
  const s = scaleOf(ap);
  if (ap.calib && s && ap.sizeSqft) {
    const sq = (ap.rooms.reduce((a, r) => a + polyArea(r.poly), 0) * s * s) / SQFT_CM2;
    if (Math.abs(sq - ap.sizeSqft) / ap.sizeSqft > 0.3) out.push(`Rooms add up to ${Math.round(sq)} sq ft but you entered ${ap.sizeSqft} sq ft — check the wall measurement.`);
  }
  return out;
}

export function roomStats(ap: Apartment, room: PlanRoom) {
  const s = scaleOf(ap);
  if (!s) return null;
  const b = bbox(room.poly);
  return { w: (b.x1 - b.x0) * s, l: (b.y1 - b.y0) * s, area: polyArea(room.poly) * s * s };
}

// ---------- Sample apartment (only used when the user explicitly picks "Try a Demo") ----------
const R = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
export const sampleApartment = (): Apartment => ({
  source: "sample",
  fileName: "Sample 1B1B apartment",
  imageUri: null,
  imgW: 880,
  imgH: 730,
  rooms: [
    { id: "r-bal", kind: "balcony", label: "Balcony", poly: R(380, 20, 860, 165) },
    { id: "r-bed", kind: "bedroom", label: "Bedroom", poly: R(20, 170, 375, 495) },
    { id: "r-liv", kind: "living", label: "Living Room", poly: R(380, 170, 860, 530) },
    { id: "r-kit", kind: "kitchen", label: "Kitchen", poly: R(620, 535, 860, 710) },
    { id: "r-bath", kind: "bathroom", label: "Bathroom", poly: R(20, 500, 255, 710) },
    { id: "r-wic", kind: "closet", label: "Walk-in Closet", poly: R(260, 500, 375, 615) },
  ],
  openings: [
    { id: "d-entry", type: "door", a: { x: 420, y: 530 }, b: { x: 510, y: 530 } },
    { id: "d-bal", type: "door", a: { x: 740, y: 170 }, b: { x: 830, y: 170 } },
    { id: "d-bed", type: "door", a: { x: 377, y: 400 }, b: { x: 377, y: 490 } },
    { id: "d-bath", type: "door", a: { x: 80, y: 497 }, b: { x: 160, y: 497 } },
    { id: "d-wic", type: "door", a: { x: 280, y: 497 }, b: { x: 355, y: 497 } },
    { id: "w-liv", type: "window", a: { x: 470, y: 170 }, b: { x: 670, y: 170 } },
    { id: "w-bed", type: "window", a: { x: 20, y: 270 }, b: { x: 20, y: 390 } },
  ],
  fixtures: [{ id: "f-ctr", label: "Kitchen counter", a: { x: 800, y: 540 }, b: { x: 860, y: 710 } }],
  detection: "sample",
  detectionNote: "Structured sample geometry (not recognised from an image).",
  calib: { a: { x: 380, y: 170 }, b: { x: 380, y: 530 }, cm: 360 }, // Mia confirms a 3.6 m wall
  autoScale: null,
  sizeSqft: 650,
  homeType: "1b1b",
  unit: "m",
});

// ---------- Per-room geometry in cm (origin = room bbox top-left) ----------
export interface WallSeg {
  id: number;
  axis: "h" | "v";
  c: number; // y for horizontal walls, x for vertical walls
  s0: number;
  s1: number;
  n: 1 | -1; // inward direction on the perpendicular axis
}
export interface Seg {
  a: Pt;
  b: Pt;
}
export interface DoorGeom extends Seg {
  zone: Rect;
  n: Pt;
}
export interface RoomGeom {
  id: string;
  label: string;
  kind: RoomKind;
  unit: Apartment["unit"];
  width: number;
  length: number;
  area: number;
  poly: Pt[];
  walls: WallSeg[];
  doors: DoorGeom[];
  windows: Seg[];
  obstacles: { label: string; rect: Rect }[];
}

export function buildGeom(ap: Apartment, roomId: string | null): RoomGeom | null {
  const s = scaleOf(ap);
  const room = ap.rooms.find((r) => r.id === roomId);
  if (!s || !room || room.poly.length < 3) return null;
  const b = bbox(room.poly);
  const T = (p: Pt): Pt => ({ x: (p.x - b.x0) * s, y: (p.y - b.y0) * s });
  const poly = room.poly.map(T);
  const walls: WallSeg[] = [];
  poly.forEach((a, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = Math.abs(q.x - a.x);
    const dy = Math.abs(q.y - a.y);
    if (dy <= dx * 0.14 && dx >= 40) {
      const c = (a.y + q.y) / 2;
      const m = { x: (a.x + q.x) / 2, y: c };
      walls.push({ id: walls.length, axis: "h", c, s0: Math.min(a.x, q.x), s1: Math.max(a.x, q.x), n: pointInPoly({ x: m.x, y: c + 10 }, poly) ? 1 : -1 });
    } else if (dx <= dy * 0.14 && dy >= 40) {
      const c = (a.x + q.x) / 2;
      const m = { x: c, y: (a.y + q.y) / 2 };
      walls.push({ id: walls.length, axis: "v", c, s0: Math.min(a.y, q.y), s1: Math.max(a.y, q.y), n: pointInPoly({ x: c + 10, y: m.y }, poly) ? 1 : -1 });
    }
  });
  const near = (a: Pt, b2: Pt) => distToPolyEdges({ x: (a.x + b2.x) / 2, y: (a.y + b2.y) / 2 }, poly) <= 45;
  const doors: DoorGeom[] = [];
  const windows: Seg[] = [];
  ap.openings.forEach((o) => {
    const a = T(o.a);
    const q = T(o.b);
    if (!near(a, q)) return;
    if (o.type === "window") return windows.push({ a, b: q });
    const w = dist(a, q);
    if (w < 1) return;
    let n = { x: -(q.y - a.y) / w, y: (q.x - a.x) / w };
    const mid = { x: (a.x + q.x) / 2, y: (a.y + q.y) / 2 };
    if (!pointInPoly({ x: mid.x + n.x * 20, y: mid.y + n.y * 20 }, poly)) n = { x: -n.x, y: -n.y };
    const pts = [a, q, { x: a.x + n.x * w, y: a.y + n.y * w }, { x: q.x + n.x * w, y: q.y + n.y * w }];
    const bb = bbox(pts);
    doors.push({ a, b: q, n, zone: { x: bb.x0, y: bb.y0, w: Math.max(bb.x1 - bb.x0, 1), h: Math.max(bb.y1 - bb.y0, 1) } });
  });
  const obstacles = ap.fixtures
    .map((f) => {
      const a = T(f.a);
      const q = T(f.b);
      return { label: f.label, rect: { x: Math.min(a.x, q.x), y: Math.min(a.y, q.y), w: Math.abs(q.x - a.x), h: Math.abs(q.y - a.y) } };
    })
    .filter((o) => o.rect.x < (b.x1 - b.x0) * s && o.rect.y < (b.y1 - b.y0) * s && o.rect.x + o.rect.w > 0 && o.rect.y + o.rect.h > 0);
  return { id: room.id, label: room.label, kind: room.kind, unit: ap.unit, width: (b.x1 - b.x0) * s, length: (b.y1 - b.y0) * s, area: polyArea(poly), poly, walls, doors, windows, obstacles };
}

/** Geometry of the rectangular room confirmed in Step 2. */
export function specToGeom(spec: RoomSpec, unit: Unit, kind: RoomKind): RoomGeom {
  const W = spec.width;
  const L = spec.length;
  const seg = (o: WallOpening) => {
    const len = o.wall === "top" || o.wall === "bottom" ? W : L;
    const s0 = o.at * len - o.width / 2;
    const s1 = s0 + o.width;
    switch (o.wall) {
      case "top":
        return { a: { x: s0, y: 0 }, b: { x: s1, y: 0 }, n: { x: 0, y: 1 } };
      case "bottom":
        return { a: { x: s0, y: L }, b: { x: s1, y: L }, n: { x: 0, y: -1 } };
      case "left":
        return { a: { x: 0, y: s0 }, b: { x: 0, y: s1 }, n: { x: 1, y: 0 } };
      default:
        return { a: { x: W, y: s0 }, b: { x: W, y: s1 }, n: { x: -1, y: 0 } };
    }
  };
  const d = seg(spec.door);
  const w = spec.door.width;
  const pts = [d.a, d.b, { x: d.a.x + d.n.x * w, y: d.a.y + d.n.y * w }, { x: d.b.x + d.n.x * w, y: d.b.y + d.n.y * w }];
  const bb = bbox(pts);
  return {
    id: "room",
    label: KIND_LABEL[kind],
    kind,
    unit,
    width: W,
    length: L,
    area: W * L,
    poly: R(0, 0, W, L),
    walls: [
      { id: 0, axis: "h", c: 0, s0: 0, s1: W, n: 1 },
      { id: 1, axis: "v", c: W, s0: 0, s1: L, n: -1 },
      { id: 2, axis: "h", c: L, s0: 0, s1: W, n: -1 },
      { id: 3, axis: "v", c: 0, s0: 0, s1: L, n: 1 },
    ],
    doors: [{ a: d.a, b: d.b, n: d.n, zone: { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 } }],
    windows: spec.windows.map((o) => {
      const s = seg(o);
      return { a: s.a, b: s.b };
    }),
    obstacles: [],
  };
}

/** Convert the recognition API response (0-1000 normalised) into editable image-space geometry. */
export function fromDetection(
  d: { rooms: { label: string; kind: RoomKind; polygon: number[][] }[]; doors: Record<string, number>[]; windows: Record<string, number>[]; fixtures: (Record<string, number> & { label: string })[] },
  w: number,
  h: number,
) {
  const P = (x: number, y: number): Pt => ({ x: (x / 1000) * w, y: (y / 1000) * h });
  return {
    rooms: d.rooms.map((r) => ({ id: uid(), kind: r.kind, label: r.label.replace(/\b\w+/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase()), poly: r.polygon.map(([x, y]) => P(x, y)) })),
    openings: [
      ...d.doors.map((o) => ({ id: uid(), type: "door" as const, a: P(o.x1, o.y1), b: P(o.x2, o.y2) })),
      ...d.windows.map((o) => ({ id: uid(), type: "window" as const, a: P(o.x1, o.y1), b: P(o.x2, o.y2) })),
    ],
    fixtures: d.fixtures.map((o) => ({ id: uid(), label: o.label, a: P(o.x1, o.y1), b: P(o.x2, o.y2) })),
  };
}
