// Local demo furniture catalog (99 products). Demo data only — NOT live retailer inventory.
// Product URLs are null because none are verified.
import { CategoryId, MoodId, Product, StyleId } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  maxQty: number;
  defaultPriority: "essential" | "optional";
  defaultPct: number; // default budget allocation weight (%)
  hint: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "sofa", label: "Sofa", maxQty: 1, defaultPriority: "essential", defaultPct: 30, hint: "Main seating" },
  { id: "coffee_table", label: "Coffee table", maxQty: 1, defaultPriority: "essential", defaultPct: 8, hint: "Centre piece" },
  { id: "tv_stand", label: "TV stand", maxQty: 1, defaultPriority: "essential", defaultPct: 12, hint: "Media wall" },
  { id: "armchair", label: "Armchair", maxQty: 2, defaultPriority: "optional", defaultPct: 15, hint: "Extra seat" },
  { id: "side_table", label: "Side table", maxQty: 2, defaultPriority: "optional", defaultPct: 4, hint: "Beside the sofa" },
  { id: "floor_lamp", label: "Floor lamp", maxQty: 1, defaultPriority: "optional", defaultPct: 5, hint: "Warm light" },
  { id: "bookshelf", label: "Bookshelf", maxQty: 2, defaultPriority: "optional", defaultPct: 9, hint: "Storage" },
  { id: "desk", label: "Desk", maxQty: 1, defaultPriority: "optional", defaultPct: 10, hint: "Study corner" },
  { id: "rug", label: "Rug", maxQty: 1, defaultPriority: "optional", defaultPct: 7, hint: "Anchors the zone" },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryMeta>;

export const STYLES: { id: StyleId; label: string; blurb: string }[] = [
  { id: "japandi", label: "Japandi", blurb: "Calm oak, linen and low silhouettes" },
  { id: "scandinavian", label: "Scandinavian", blurb: "Light woods, airy and functional" },
  { id: "midcentury", label: "Mid-Century Modern", blurb: "Walnut, tapered legs, bold curves" },
  { id: "industrial", label: "Industrial", blurb: "Steel, leather and raw textures" },
];
export const STYLE_LABEL = Object.fromEntries(STYLES.map((s) => [s.id, s.label])) as Record<StyleId, string>;

export const MOODS: { id: MoodId; label: string }[] = [
  { id: "warm", label: "Warm & Cozy" },
  { id: "bright", label: "Light & Bright" },
  { id: "bold", label: "Bold & Statement" },
];

const RETAILER: Record<StyleId, string> = {
  japandi: "Oak & Ivory (demo)",
  scandinavian: "Northwood Home (demo)",
  midcentury: "Atelier Living (demo)",
  industrial: "Urban Foundry (demo)",
};

// name|width|depth|height|price|styles|mood
const RAW: Record<CategoryId, string> = {
  sofa: `Kumo 3-Seat Sofa|190|90|80|499|japandi|warm
Hana Compact Sofa|175|85|78|399|japandi,scandinavian|warm
Lund Linen Sofa|200|92|82|649|scandinavian|bright
Fjord Loveseat|150|82|80|349|scandinavian|bright
Atomic Walnut Sofa|210|88|78|899|midcentury|bold
Harlow Tufted Sofa|185|86|80|579|midcentury|warm
Foundry Leather Sofa|205|95|84|1099|industrial|bold
Rivet Canvas Sofa|180|88|80|459|industrial|warm
Mori Low Sofa|220|95|70|1249|japandi|warm
Birch Sleeper Sofa|195|95|85|729|scandinavian|warm
Loft Modular Sofa|240|95|78|1399|industrial,midcentury|bold`,
  coffee_table: `Kumo Oak Coffee Table|110|55|40|179|japandi|warm
Hana Round Coffee Table|80|80|38|139|japandi,scandinavian|warm
Lund Ash Coffee Table|100|50|42|119|scandinavian|bright
Fjord Nesting Tables|90|50|45|159|scandinavian|bright
Atomic Oval Coffee Table|120|60|40|249|midcentury|bold
Harlow Walnut Coffee Table|105|55|41|199|midcentury|warm
Foundry Iron Coffee Table|120|65|45|289|industrial|bold
Rivet Crate Coffee Table|90|60|40|99|industrial|warm
Mori Low Tea Table|100|60|33|219|japandi|warm
Birch Lift-Top Table|110|55|45|169|scandinavian|warm
Loft Reclaimed Table|130|70|45|349|industrial|bold`,
  tv_stand: `Kumo Slatted Media Unit|160|40|50|299|japandi|warm
Hana Low TV Bench|140|38|45|219|japandi,scandinavian|warm
Lund White TV Stand|150|40|52|179|scandinavian|bright
Fjord Compact Media Shelf|110|35|55|129|scandinavian|bright
Atomic Walnut Credenza|170|45|60|549|midcentury|bold
Harlow Media Console|150|42|58|389|midcentury|warm
Foundry Steel Media Unit|180|45|55|459|industrial|bold
Rivet Pipe TV Stand|130|40|60|159|industrial|warm
Mori Floating Bench|180|35|35|339|japandi|warm
Birch Media Cabinet|160|42|55|269|scandinavian|warm
Loft Industrial Console|200|45|60|599|industrial|bold`,
  armchair: `Kumo Lounge Chair|80|80|78|349|japandi|warm
Hana Cane Armchair|72|75|76|249|japandi,scandinavian|warm
Lund Wingback Chair|78|82|100|399|scandinavian|bright
Fjord Accent Chair|68|72|80|189|scandinavian|bright
Atomic Lounge Chair|85|85|82|799|midcentury|bold
Harlow Shell Chair|70|72|78|299|midcentury|warm
Foundry Leather Club Chair|88|88|80|649|industrial|bold
Rivet Sling Chair|70|78|75|219|industrial|warm
Mori Floor Lounger|75|80|60|279|japandi|warm
Birch Boucle Chair|76|78|76|329|scandinavian|warm
Loft Rivet Armchair|82|84|80|459|industrial,midcentury|bold`,
  side_table: `Kumo Stump Side Table|40|40|50|89|japandi|warm
Hana Round Side Table|45|45|52|69|japandi,scandinavian|warm
Lund C-Table|40|35|60|59|scandinavian|bright
Fjord Tray Table|42|42|55|49|scandinavian|bright
Atomic Tulip Side Table|50|50|52|159|midcentury|bold
Harlow Walnut End Table|45|40|55|119|midcentury|warm
Foundry Steel Drum Table|45|45|50|129|industrial|bold
Rivet Pipe Side Table|40|40|55|65|industrial|warm
Mori Lacquer Stool|35|35|45|79|japandi|warm
Birch Drawer Side Table|45|40|55|99|scandinavian|warm
Loft Crate End Table|50|45|55|109|industrial|bold`,
  floor_lamp: `Kumo Paper Floor Lamp|40|40|150|129|japandi|warm
Hana Linen Floor Lamp|35|35|155|99|japandi,scandinavian|warm
Lund Tripod Lamp|45|45|160|89|scandinavian|bright
Fjord Slim Reading Lamp|30|30|140|59|scandinavian|bright
Atomic Arc Lamp|40|40|190|229|midcentury|bold
Harlow Globe Lamp|35|35|160|149|midcentury|warm
Foundry Factory Lamp|40|40|165|179|industrial|bold
Rivet Pipe Floor Lamp|35|35|155|79|industrial|warm
Mori Lantern Lamp|35|35|120|119|japandi|warm
Birch Wood Tripod Lamp|45|45|150|109|scandinavian|warm
Loft Edison Lamp|30|30|170|139|industrial|bold`,
  bookshelf: `Kumo Open Shelf|80|30|180|249|japandi|warm
Hana Low Bookcase|100|30|90|189|japandi,scandinavian|warm
Lund Ladder Shelf|60|35|180|119|scandinavian|bright
Fjord Cube Bookcase|77|39|147|99|scandinavian|bright
Atomic Walnut Bookcase|90|35|180|459|midcentury|bold
Harlow Room Divider|100|35|160|329|midcentury|warm
Foundry Pipe Bookshelf|100|35|185|299|industrial|bold
Rivet Narrow Shelf|50|30|175|89|industrial|warm
Mori Bamboo Shelf|70|30|120|139|japandi|warm
Birch Tall Bookcase|80|28|200|179|scandinavian|warm
Loft Steel Etagere|120|40|190|499|industrial|bold`,
  desk: `Kumo Writing Desk|110|55|75|259|japandi|warm
Hana Compact Desk|90|50|74|179|japandi,scandinavian|warm
Lund Ash Desk|120|60|75|229|scandinavian|bright
Fjord Wall Desk|80|45|75|129|scandinavian|bright
Atomic Walnut Desk|130|60|76|549|midcentury|bold
Harlow Secretary Desk|100|50|90|379|midcentury|warm
Foundry Iron Desk|140|65|76|399|industrial|bold
Rivet Pipe Desk|110|55|75|169|industrial|warm
Mori Low Desk|100|55|70|219|japandi|warm
Birch Study Desk|115|58|75|249|scandinavian|warm
Loft Workbench Desk|150|70|78|459|industrial|bold`,
  rug: `Kumo Jute Rug|200|140|1|149|japandi|warm
Hana Wool Rug|240|170|1|229|japandi,scandinavian|warm
Lund Flatweave Rug|200|140|1|119|scandinavian|bright
Fjord Striped Rug|160|120|1|79|scandinavian|bright
Atomic Geometric Rug|240|170|1|299|midcentury|bold
Harlow Vintage Rug|200|150|1|199|midcentury|warm
Foundry Distressed Rug|250|180|1|319|industrial|bold
Rivet Cotton Rug|180|120|1|99|industrial|warm
Mori Tatami Mat|180|180|1|189|japandi|warm
Birch Shag Rug|200|140|1|169|scandinavian|warm
Loft Kilim Rug|230|160|1|259|industrial|bold`,
};

const MOOD_TEXT: Record<MoodId, string> = { warm: "a warm, cozy finish", bright: "a light, airy finish", bold: "a bold statement finish" };

export const PRODUCTS: Product[] = (Object.keys(RAW) as CategoryId[]).flatMap((cat) =>
  RAW[cat].split("\n").map((line, i) => {
    const [name, w, d, h, price, styles, mood] = line.split("|");
    const st = styles.split(",") as StyleId[];
    return {
      id: `${cat}-${String(i + 1).padStart(2, "0")}`,
      name,
      category: cat,
      width: +w,
      depth: +d,
      height: +h,
      price: +price,
      styles: st,
      mood: mood as MoodId,
      retailer: RETAILER[st[0]],
      url: null,
      description: `${STYLE_LABEL[st[0]]}-inspired ${CATEGORY_MAP[cat].label.toLowerCase()} with ${MOOD_TEXT[mood as MoodId]}. Demo catalog entry used for planning — not verified live inventory.`,
    };
  }),
);

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const productsIn = (cat: CategoryId) => PRODUCTS.filter((p) => p.category === cat);
