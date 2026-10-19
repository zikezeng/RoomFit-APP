// Room geometry & calibration. All internal values are centimetres.
import { Opening, Rect, Room, Unit, Wall } from "./types";

export const CM_PER_FT = 30.48;
export const MIN_ROOM_CM = 200;
export const MAX_ROOM_CM = 1500;

/** Structured sample floor plan (living room, 4.8 m x 3.6 m). */
export const SAMPLE_ROOM: Room = {
  roomType: "living",
  width: 480,
  length: 360,
  unit: "m",
  door: { wall: "bottom", at: 0.16, width: 90 },
  windows: [
    { wall: "top", at: 0.5, width: 160 },
    { wall: "right", at: 0.5, width: 120 },
  ],
};

export const WALL_LABEL: Record<Wall, string> = { top: "Top wall", bottom: "Bottom wall", left: "Left wall", right: "Right wall" };

export const toUnit = (cm: number, unit: Unit) => (unit === "m" ? cm / 100 : cm / CM_PER_FT);
export const fromUnit = (v: number, unit: Unit) => (unit === "m" ? v * 100 : v * CM_PER_FT);
export const fmtLen = (cm: number, unit: Unit) =>
  unit === "m" ? `${(cm / 100).toFixed(2)} m` : `${(cm / CM_PER_FT).toFixed(1)} ft`;
export const fmtArea = (room: Room) => {
  const m2 = (room.width * room.length) / 10000;
  return room.unit === "m" ? `${m2.toFixed(1)} m²` : `${(m2 * 10.7639).toFixed(0)} sq ft`;
};

export const wallLength = (room: Room, wall: Wall) => (wall === "top" || wall === "bottom" ? room.width : room.length);

/** Scale the room proportionally so `wall` measures `cm` (sample-plan calibration). */
export function calibrate(room: Room, wall: Wall, cm: number): Room {
  const k = cm / wallLength(room, wall);
  return { ...room, width: Math.round(room.width * k), length: Math.round(room.length * k) };
}

export function validateDims(w: number, l: number): string | null {
  if (!isFinite(w) || !isFinite(l)) return "Please enter valid numbers.";
  if (w < MIN_ROOM_CM || l < MIN_ROOM_CM) return "A living room must be at least 2 m (6.6 ft) on each side.";
  if (w > MAX_ROOM_CM || l > MAX_ROOM_CM) return "Each side must be under 15 m (49 ft).";
  return null;
}

/** Strip of `depth` cm running along the opening, inside the room. */
export function openingRect(room: Room, op: Opening, depth: number): Rect {
  const len = wallLength(room, op.wall);
  const start = op.at * len - op.width / 2;
  switch (op.wall) {
    case "top":
      return { x: start, y: 0, w: op.width, h: depth };
    case "bottom":
      return { x: start, y: room.length - depth, w: op.width, h: depth };
    case "left":
      return { x: 0, y: start, w: depth, h: op.width };
    default:
      return { x: room.width - depth, y: start, w: depth, h: op.width };
  }
}

/** Door swing area (door width x door width) that must stay clear. */
export const doorZone = (room: Room) => openingRect(room, room.door, room.door.width);

export const rectsOverlap = (a: Rect, b: Rect, eps = 0.5) =>
  a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

export const insideRoom = (r: Rect, room: Room) =>
  r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= room.width + 0.5 && r.y + r.h <= room.length + 0.5;

export function pointRectDist(px: number, py: number, r: Rect) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function rectGap(a: Rect, b: Rect) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
