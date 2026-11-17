// Real size / colour / shape of a product chosen in Step 8, and whether it fits the space the layout
// keeps for it. Used by the Step 8 list, the product sheet, the Step 9 list and the 3D preview so
// they all say the same thing.
import { CategoryId, RealProductDetails, RealProductSelection } from "./types";

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
}

/** Compare the product's real footprint with the space (cm) the layout keeps for this piece. */
export function fitCheck(d: RealProductDetails | null | undefined, space: { width: number; depth: number }): FitResult {
  if (!d || d.status === "loading") return { level: "unknown", text: "Checking size…" };
  if (d.status !== "ok" || (d.width === null && d.depth === null)) return { level: "unknown", text: "Size unknown — check the product page before buying." };
  const TOL = 3; // cm of slack before we warn
  const over: string[] = [];
  if (d.width !== null && d.width - space.width > TOL) over.push(`${r(d.width - space.width)} cm wider`);
  if (d.depth !== null && d.depth - space.depth > TOL) over.push(`${r(d.depth - space.depth)} cm deeper`);
  if (over.length) return { level: "warn", text: `${over.join(" and ")} than the ${r(space.width)}×${r(space.depth)} cm space in your layout — it may not fit.` };
  if (d.width === null || d.depth === null) return { level: "unknown", text: `${d.width !== null ? "Width" : "Depth"} fits; the other side is unknown.` };
  return { level: "ok", text: `Fits the ${r(space.width)}×${r(space.depth)} cm space in your layout.` };
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
