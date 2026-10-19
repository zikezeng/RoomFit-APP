export type Wall = "top" | "bottom" | "left" | "right";
export type Facing = "up" | "down" | "left" | "right";
export type Unit = "m" | "ft";
export type CategoryId =
  | "sofa"
  | "coffee_table"
  | "tv_stand"
  | "armchair"
  | "side_table"
  | "floor_lamp"
  | "bookshelf"
  | "desk"
  | "rug";
export type StyleId = "japandi" | "scandinavian" | "midcentury" | "industrial";
export type MoodId = "warm" | "bright" | "bold";
export type RoomType = "living"; // future: "bedroom" | "office" ...

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  width: number; // cm
  depth: number; // cm
  height: number; // cm
  price: number; // USD
  styles: StyleId[];
  mood: MoodId;
  retailer: string;
  url: string | null; // only when verified — none in demo catalog
  description: string;
}

/** Door / window on a wall. `at` = fraction (0..1) of wall length for the opening centre. */
export interface Opening {
  wall: Wall;
  at: number;
  width: number; // cm
}

export interface Room {
  roomType: RoomType;
  width: number; // cm (top/bottom walls)
  length: number; // cm (left/right walls)
  unit: Unit;
  door: Opening;
  windows: Opening[];
}

export interface PlacedItem {
  uid: string;
  category: CategoryId;
  productId: string;
  cx: number;
  cy: number;
  facing: Facing;
  wall: Wall | null; // back against this wall
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Layout {
  id: string;
  name: string;
  tagline: string;
  valid: boolean;
  items: PlacedItem[];
  total: number;
  checks: Check[];
  problems: string[];
  suggestions: string[];
}

export interface Need {
  qty: number;
  priority: "essential" | "optional";
}

export interface StylePrefs {
  styles: StyleId[];
  moods: MoodId[];
}
