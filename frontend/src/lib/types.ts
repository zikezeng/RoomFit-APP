export type Wall = "top" | "bottom" | "left" | "right";
export interface WallOpening {
  wall: Wall;
  at: number; // fraction of wall length for the opening centre
  width: number; // cm
}
/** Rectangular room the user confirms in Step 2 (cm). */
export interface RoomSpec {
  width: number;
  length: number;
  door: WallOpening;
  windows: WallOpening[];
}
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
  | "rug"
  | "dining_table"
  | "dining_chair"
  | "shoe_cabinet"
  | "cabinet"
  | "study_chair"
  | "bed_frame"
  | "mattress"
  | "nightstand"
  | "wardrobe"
  | "dresser"
  | "ottoman"
  | "console_table"
  | "floor_mirror"
  | "planter"
  | "bench"
  | "custom";
export type StyleId = "modern" | "scandinavian" | "minimalist" | "industrial" | "midcentury" | "traditional" | "farmhouse" | "bohemian" | "japandi";
export type MoodId = "warm" | "bright" | "bold";
export type RoomKind = "living" | "bedroom" | "kitchen" | "bathroom" | "closet" | "balcony" | "dining" | "hallway" | "other";

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

/** Real product chosen by the user in Step 8.
 * Kept separate from Product/PlacedItem because the layout solver still relies on
 * the proxy product's verified dimensions.
 */
export interface RealProductSelection {
  id: string;
  category: CategoryId;
  title: string;
  price: number | null;
  price_text: string | null;
  retailer: string;
  url: string;
  image: string | null;
  rating: number | null;
  reviews: number | null;
  delivery: string | null;
  direct_retailer: boolean;
}

export interface Pt {
  x: number;
  y: number;
}

/** Image-space (px) apartment model — the uploaded floor plan is the source of truth. */
export interface PlanRoom {
  id: string;
  kind: RoomKind;
  label: string;
  poly: Pt[];
  manualSqft?: number | null;
}
export interface PlanOpening {
  id: string;
  type: "door" | "window";
  a: Pt;
  b: Pt;
}
export interface PlanFixture {
  id: string;
  label: string;
  a: Pt;
  b: Pt;
}
export interface Apartment {
  source: "upload" | "sample" | null;
  fileName: string | null;
  imageUri: string | null; // data URI of the uploaded image (persisted locally)
  imgW: number;
  imgH: number;
  rooms: PlanRoom[];
  openings: PlanOpening[];
  fixtures: PlanFixture[];
  detection: "none" | "pending" | "ai" | "manual" | "failed" | "sample";
  detectionNote: string | null;
  calib: { a: Pt; b: Pt; cm: number } | null;
  autoScale: number | null; // cm per px estimated from the apartment size
  sizeSqft: number | null;
  homeType: HomeType | null;
  unit: Unit;
}
export type HomeType = "studio" | "1b1b" | "2b1b" | "2b2b" | "3b2b";

export interface PlacedItem {
  roomId?: string; // coordinates are local to this room
  uid: string;
  category: CategoryId;
  productId: string;
  cx: number;
  cy: number;
  facing: Facing;
  wall: number | null; // index into RoomGeom.walls — back against this wall
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
