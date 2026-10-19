// Local demo furniture catalog (99 products). Demo data only — NOT live retailer inventory.
// Product URLs are null because none are verified.
import { CategoryId, MoodId, Product, RoomKind, StyleId } from "./types";

type Role = "essential" | "optional";
export interface CategoryMeta {
  id: CategoryId;
  label: string;
  maxQty: number;
  defaultPct: number; // default budget allocation weight (%)
  hint: string;
  rooms: Partial<Record<RoomKind, Role>>; // which room types recommend this item
  preselect?: Partial<Record<RoomKind, number>>;
}

const C = (id: CategoryId, label: string, maxQty: number, defaultPct: number, hint: string, rooms: CategoryMeta["rooms"], preselect?: CategoryMeta["preselect"]): CategoryMeta => ({ id, label, maxQty, defaultPct, hint, rooms, preselect });

export const CATEGORIES: CategoryMeta[] = [
  C("sofa", "Sofa", 1, 30, "Main seating", { living: "essential" }, { living: 1 }),
  C("coffee_table", "Coffee table", 1, 8, "Centre piece", { living: "essential" }, { living: 1 }),
  C("tv_stand", "TV stand", 1, 12, "Media wall", { living: "essential" }, { living: 1 }),
  C("armchair", "Chair / armchair", 2, 15, "Extra seat", { living: "essential", bedroom: "optional", balcony: "essential" }, { balcony: 2 }),
  C("floor_lamp", "Lamp", 2, 5, "Warm light", { living: "essential", bedroom: "essential", dining: "optional", closet: "optional" }),
  C("dining_table", "Dining table", 1, 14, "Meals for 2-6", { living: "essential", dining: "essential", kitchen: "optional" }, { dining: 1 }),
  C("dining_chair", "Dining chair", 6, 5, "Around the table", { living: "essential", dining: "essential", kitchen: "optional" }, { dining: 4 }),
  C("shoe_cabinet", "Shoe cabinet", 1, 6, "By the entrance", { living: "essential", hallway: "essential" }, { hallway: 1 }),
  C("cabinet", "Storage cabinet", 2, 8, "Sideboard / cupboard", { living: "essential", bedroom: "essential", kitchen: "essential", dining: "optional", closet: "optional" }, { kitchen: 1 }),
  C("bed_frame", "Bed / bed frame", 1, 22, "Headboard to wall", { bedroom: "essential", living: "optional" }, { bedroom: 1 }),
  C("mattress", "Mattress", 1, 20, "Sized to the frame", { bedroom: "essential", living: "optional" }, { bedroom: 1 }),
  C("nightstand", "Nightstand", 2, 5, "Beside the bed", { bedroom: "essential", living: "optional" }, { bedroom: 2 }),
  C("wardrobe", "Wardrobe", 2, 16, "Clothes storage", { bedroom: "essential", closet: "essential", living: "optional" }, { bedroom: 1, closet: 1 }),
  C("desk", "Desk", 1, 10, "Study corner", { living: "optional", bedroom: "essential" }),
  C("study_chair", "Study chair", 1, 6, "At the desk", { living: "optional", bedroom: "essential" }),
  C("dresser", "Dresser", 1, 10, "Drawers", { bedroom: "optional", closet: "essential" }),
  C("side_table", "Side table", 2, 4, "Beside the sofa", { living: "optional", bedroom: "optional", balcony: "essential" }, { balcony: 1 }),
  C("bookshelf", "Bookshelf", 2, 9, "Books & display", { living: "optional", bedroom: "optional", hallway: "optional" }),
  C("rug", "Rug", 1, 7, "Anchors the zone", { living: "optional", bedroom: "optional", dining: "optional" }),
  C("console_table", "Console table", 1, 6, "Entry or behind sofa", { living: "optional", hallway: "optional" }),
  C("ottoman", "Ottoman / pouf", 2, 5, "Footrest, extra seat", { living: "optional", bedroom: "optional", closet: "optional", balcony: "optional" }),
  C("bench", "Bench", 1, 5, "Entry or bed end", { living: "optional", bedroom: "optional", hallway: "optional", closet: "optional", balcony: "optional", kitchen: "optional" }),
  C("floor_mirror", "Floor mirror", 1, 4, "Leaning mirror", { living: "optional", bedroom: "optional", closet: "essential", hallway: "optional" }, { closet: 1 }),
  C("planter", "Plant / planter", 3, 2, "Greenery", { living: "optional", bedroom: "optional", balcony: "essential", dining: "optional", kitchen: "optional" }, { balcony: 2 }),
];

export const CATEGORY_MAP = Object.fromEntries([...CATEGORIES, C("custom", "Custom item", 1, 5, "Your own item", {})].map((c) => [c.id, c])) as Record<CategoryId, CategoryMeta>;
export const FURNISHABLE: RoomKind[] = ["living", "bedroom", "dining", "kitchen", "closet", "balcony", "hallway"];
export const categoriesFor = (kind: RoomKind) => CATEGORIES.filter((c) => c.rooms[kind]);

export const STYLES: { id: StyleId; label: string; blurb: string }[] = [
  { id: "modern", label: "Modern", blurb: "Clean lines, function first — the base of many styles" },
  { id: "scandinavian", label: "Scandinavian", blurb: "Light woods, white walls, warm and cozy" },
  { id: "minimalist", label: "Minimalist", blurb: "Less is more — open space, few objects" },
  { id: "industrial", label: "Industrial", blurb: "Exposed brick, concrete, metal pipes, dark tones" },
  { id: "midcentury", label: "Mid-Century Modern", blurb: "Retro furniture, organic curves, wood with pops of color" },
  { id: "traditional", label: "Traditional", blurb: "Classic European furniture, symmetry, rich detail" },
  { id: "farmhouse", label: "Farmhouse", blurb: "Raw wood, distressed textures, rustic warmth" },
  { id: "bohemian", label: "Bohemian", blurb: "Rich colors, woven textiles, plants, free-spirited" },
  { id: "japandi", label: "Japandi", blurb: "Japanese-Nordic fusion: natural materials, muted, serene" },
];
export const STYLE_LABEL = Object.fromEntries(STYLES.map((s) => [s.id, s.label])) as Record<StyleId, string>;

export const MOODS: { id: MoodId; label: string }[] = [
  { id: "warm", label: "Warm & Cozy" },
  { id: "bright", label: "Light & Bright" },
  { id: "bold", label: "Bold & Statement" },
];

const RETAILER: Record<StyleId, string> = {
  modern: "Arc Studio (demo)",
  minimalist: "Arc Studio (demo)",
  traditional: "Windsor & Hale (demo)",
  farmhouse: "Windsor & Hale (demo)",
  bohemian: "Rattan House (demo)",
  japandi: "Oak & Ivory (demo)",
  scandinavian: "Northwood Home (demo)",
  midcentury: "Atelier Living (demo)",
  industrial: "Urban Foundry (demo)",
};

// name|width|depth|height|price|styles|mood
const RAW: Partial<Record<CategoryId, string>> = {
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
  dining_table: `Kumo Oak Dining Table|140|80|75|349|japandi|warm
Lund Round Dining Table|100|100|75|229|scandinavian|bright
Harlow Walnut Dining Table|160|90|76|549|midcentury|bold
Foundry Plank Dining Table|180|90|76|499|industrial,farmhouse|warm
Arc Compact Dining Table|120|75|75|199|modern,minimalist|bright
Windsor Farmhouse Table|170|90|77|459|farmhouse,traditional|warm`,
  dining_chair: `Kumo Ash Dining Chair|45|50|80|89|japandi|warm
Lund Spindle Chair|44|50|82|69|scandinavian,farmhouse|bright
Harlow Shell Dining Chair|47|53|81|119|midcentury,modern|bold
Foundry Metal Chair|45|50|84|59|industrial|bold
Arc Molded Chair|46|52|80|49|modern,minimalist|bright
Rattan Bistro Chair|48|52|84|99|bohemian|warm`,
  shoe_cabinet: `Kumo Slim Shoe Cabinet|80|30|100|159|japandi,minimalist|warm
Lund Shoe Bench|90|35|50|119|scandinavian|bright
Foundry Shoe Rack|70|30|90|69|industrial|warm
Arc Flip Shoe Cabinet|60|24|110|99|modern,minimalist|bright
Windsor Entry Cabinet|100|38|95|289|traditional|warm
Rattan Shoe Bench|90|35|48|139|bohemian|warm`,
  cabinet: `Kumo Low Sideboard|120|40|70|329|japandi|warm
Lund Storage Cabinet|80|40|90|179|scandinavian|bright
Harlow Walnut Sideboard|150|45|75|599|midcentury|bold
Foundry Metal Locker|80|45|120|249|industrial|bold
Arc Handle-less Cabinet|100|40|80|229|modern,minimalist|bright
Windsor Painted Cupboard|90|45|120|389|farmhouse,traditional|warm`,
  study_chair: `Kumo Task Chair|55|55|88|129|japandi|warm
Lund Swivel Chair|58|58|90|149|scandinavian|bright
Harlow Desk Chair|56|56|86|219|midcentury|bold
Foundry Drafting Stool|45|45|90|89|industrial|bold
Arc Ergonomic Chair|62|60|110|279|modern,minimalist|bright
Rattan Desk Chair|55|55|85|159|bohemian|warm`,
  bed_frame: `Kumo Platform Bed (Queen)|160|210|30|499|japandi,minimalist|warm
Lund Slatted Bed (Full)|145|205|90|349|scandinavian|bright
Harlow Walnut Bed (Queen)|165|215|100|699|midcentury|bold
Foundry Metal Bed (Twin)|105|200|95|199|industrial|bold
Arc Upholstered Bed (King)|200|215|110|899|modern|bright
Windsor Spindle Bed (Queen)|165|218|120|649|farmhouse,traditional|warm`,
  mattress: `Cloud Foam Mattress (Queen)|152|203|25|399|minimalist,modern|bright
Cloud Foam Mattress (Full)|137|191|25|329|minimalist,modern|bright
Hybrid Spring Mattress (Queen)|152|203|30|599|traditional,scandinavian|warm
Hybrid Spring Mattress (King)|193|203|30|799|traditional,modern|warm
Natural Latex Mattress (Queen)|152|203|22|699|japandi,bohemian|warm
Basic Foam Mattress (Twin)|97|191|20|189|minimalist|bright`,
  nightstand: `Kumo Floating Nightstand|45|35|40|89|japandi,minimalist|warm
Lund Drawer Nightstand|45|40|55|79|scandinavian|bright
Harlow Walnut Nightstand|50|40|55|159|midcentury|bold
Foundry Pipe Nightstand|40|35|60|69|industrial|warm
Windsor Classic Nightstand|50|42|65|179|traditional,farmhouse|warm
Rattan Nightstand|45|40|55|119|bohemian|warm`,
  wardrobe: `Kumo Sliding Wardrobe|150|60|200|599|japandi,minimalist|warm
Lund Two-Door Wardrobe|100|58|200|329|scandinavian|bright
Harlow Walnut Armoire|110|60|190|799|midcentury,traditional|bold
Foundry Open Clothes Rack|120|45|180|149|industrial|bold
Arc Mirror Wardrobe|120|60|210|499|modern|bright
Windsor Farmhouse Armoire|105|58|195|649|farmhouse|warm`,
  dresser: `Kumo Low Dresser|120|45|75|399|japandi|warm
Lund 6-Drawer Dresser|120|48|80|299|scandinavian|bright
Harlow Walnut Dresser|140|48|80|649|midcentury|bold
Foundry Metal Dresser|100|45|90|349|industrial|bold
Arc Minimal Dresser|110|45|78|279|modern,minimalist|bright
Windsor Chest of Drawers|90|50|110|459|traditional,farmhouse|warm`,
  ottoman: `Kumo Wool Pouf|50|50|40|69|japandi|warm
Lund Storage Ottoman|70|45|45|99|scandinavian|bright
Harlow Leather Ottoman|60|60|42|189|midcentury|bold
Rattan Woven Pouf|45|45|40|59|bohemian|warm
Arc Cube Ottoman|45|45|45|79|modern,minimalist|bright
Windsor Tufted Ottoman|80|50|45|229|traditional|warm`,
  console_table: `Kumo Slim Console|100|30|78|179|japandi|warm
Lund Entry Console|90|35|80|129|scandinavian|bright
Harlow Walnut Console|120|35|78|299|midcentury|bold
Foundry Iron Console|110|35|80|199|industrial|bold
Arc Floating Console|90|28|30|99|modern,minimalist|bright
Windsor Turned-Leg Console|120|40|80|319|traditional,farmhouse|warm`,
  floor_mirror: `Kumo Oak Floor Mirror|50|5|170|129|japandi|warm
Lund Leaning Mirror|45|4|160|89|scandinavian|bright
Harlow Arched Mirror|60|5|180|199|midcentury,modern|bold
Foundry Black Frame Mirror|55|4|175|109|industrial|bold
Windsor Gilt Mirror|65|6|180|259|traditional|warm
Rattan Sunburst Mirror|60|5|160|149|bohemian|warm`,
  planter: `Kumo Ceramic Planter|35|35|60|49|japandi|warm
Lund Plant Stand|40|40|70|39|scandinavian|bright
Foundry Metal Planter|35|35|55|45|industrial|bold
Rattan Basket Planter|40|40|50|35|bohemian|warm
Arc Tall Planter|30|30|80|59|modern,minimalist|bright
Windsor Urn Planter|40|40|65|79|traditional,farmhouse|warm`,
  bench: `Kumo Oak Bench|110|35|45|159|japandi|warm
Lund Spindle Bench|100|35|46|119|scandinavian,farmhouse|bright
Harlow Upholstered Bench|120|40|46|229|midcentury|bold
Foundry Plank Bench|120|35|45|139|industrial|warm
Arc Minimal Bench|100|32|44|99|modern,minimalist|bright
Rattan Storage Bench|100|40|45|169|bohemian|warm`,
};

// Secondary style tags so every style has matching products (transparent metadata, not AI).
const STYLE_EXTRA: Partial<Record<StyleId, StyleId[]>> = { japandi: ["minimalist"], scandinavian: ["minimalist"], midcentury: ["modern", "bohemian"], industrial: ["modern"] };

const MOOD_TEXT: Record<MoodId, string> = { warm: "a warm, cozy finish", bright: "a light, airy finish", bold: "a bold statement finish" };

export const PRODUCTS: Product[] = (Object.keys(RAW) as CategoryId[]).flatMap((cat) =>
  RAW[cat]!.split("\n").map((line, i) => {
    const [name, w, d, h, price, styles, mood] = line.split("|");
    const base = styles.split(",") as StyleId[];
    const st = [...base, ...(STYLE_EXTRA[base[0]] ?? []).filter((x) => !base.includes(x))];
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

// User-entered custom items live alongside the catalog (registered by the plan store).
let CUSTOM: Record<string, Product> = {};
export const setCustomProducts = (list: Product[]) => {
  CUSTOM = Object.fromEntries(list.map((p) => [p.id, p]));
};
export const getProduct = (id: string): Product => PRODUCT_MAP[id] ?? CUSTOM[id];
