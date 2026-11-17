import { getProduct } from "./catalog";
import { GenInput, perUnitAllocation } from "./solver";
import { CategoryId, PlacedItem, RealProductSelection } from "./types";

/** How one layout position counts towards the budget. */
export type ShoppingLine =
  | { status: "real"; price: number | null } // real product chosen in Step 8 (price can be missing from the listing)
  | { status: "custom"; price: number } // the user's own item, at the price they entered
  | { status: "unchosen"; price: null }; // nothing chosen yet — the demo price is only a planning estimate

export interface ShoppingTotals {
  lines: ShoppingLine[];
  /** Sum of real prices + custom item prices. Unchosen and unpriced positions add nothing. */
  spent: number;
  chosen: number;
  unpriced: number;
  toChoose: number;
}

/** Single source of truth for Step 8 and Step 9 money: only real choices count. */
export function shoppingTotals(rows: { item: PlacedItem; real?: RealProductSelection }[]): ShoppingTotals {
  let cents = 0;
  let chosen = 0;
  let unpriced = 0;
  let toChoose = 0;
  const lines = rows.map(({ item, real }): ShoppingLine => {
    if (real) {
      chosen += 1;
      const price = typeof real.price === "number" && isFinite(real.price) && real.price >= 0 ? real.price : null;
      if (price === null) unpriced += 1;
      else cents += Math.round(price * 100);
      return { status: "real", price };
    }
    const p = getProduct(item.productId);
    if (p.category === "custom") {
      cents += Math.round(p.price * 100);
      return { status: "custom", price: p.price };
    }
    toChoose += 1;
    return { status: "unchosen", price: null };
  });
  return { lines, spent: cents / 100, chosen, unpriced, toChoose };
}

/** Text under the budget bar: what is still open and roughly what is left per piece. */
// Per-piece amounts come from the Step 6 budget for each furniture type (see spotBudget), so the note
// only says how many pieces are left rather than splitting the room budget evenly.
export function budgetNote(t: ShoppingTotals, _budget: number, _fmt: (n: number) => string): string {
  const pieces = `${t.toChoose} ${t.toChoose === 1 ? "piece" : "pieces"} still to choose`;
  return [
    t.toChoose === 0 ? "All pieces chosen" : pieces,
    t.unpriced > 0 ? `${t.unpriced} chosen without a listed price (not counted)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface SpotBudget {
  /** Price limit for this one piece (USD). 0 = this category's Step 6 budget is already used up. */
  cap: number;
  category: CategoryId;
  /** Step 6 budget for the whole category in this room (all pieces of that type). */
  categoryTarget: number;
  /** Pieces of this type in the room, and how many are still open (this one included). */
  qty: number;
  open: number;
  /** Real prices already spent on OTHER pieces of the same type. */
  spentByOthers: number;
}

/** The parts of a room's Step 4–6 settings the budget needs. */
export interface RoomBudgetSettings {
  needs: GenInput["needs"];
  categoryBudgets?: Partial<Record<CategoryId, number>>;
  allocations: GenInput["allocations"];
  budget: number;
  customItems: { price: number }[];
}

/**
 * Price limit for one piece, taken from the user's Step 6 budget for its furniture type.
 * Step 6 stores a total per type ("2× Dining chair: $200"). Real prices already chosen for other pieces
 * of that type are subtracted, and the rest is split evenly over the pieces still to choose (this one
 * included). When Step 6 was left untouched, the default split shown there is used — the same numbers
 * the layout solver uses. Returns null for the user's own custom items.
 */
export function spotBudget(cfg: RoomBudgetSettings, plan: PlacedItem[], real: Record<string, RealProductSelection | undefined>, uid: string): SpotBudget | null {
  const me = plan.find((it) => it.uid === uid);
  if (!me) return null;
  const category = getProduct(me.productId).category;
  if (category === "custom") return null;
  const same = plan.filter((it) => getProduct(it.productId).category === category);
  const qty = Math.max(cfg.needs[category]?.qty ?? 0, same.length, 1);
  const explicit = cfg.categoryBudgets?.[category];
  const customCost = cfg.customItems.reduce((s, x) => s + x.price, 0);
  const perUnitDefault = perUnitAllocation(cfg.needs, cfg.allocations, Math.max(0, cfg.budget - customCost))[category] ?? 0;
  const categoryTarget = typeof explicit === "number" && Number.isFinite(explicit) ? Math.max(0, explicit) : perUnitDefault * qty;
  let spentByOthers = 0;
  let open = 1;
  for (const it of same) {
    if (it.uid === uid) continue;
    const sel = real[it.uid];
    if (!sel) open += 1;
    else if (typeof sel.price === "number" && Number.isFinite(sel.price)) spentByOthers += sel.price;
  }
  const left = categoryTarget - spentByOthers;
  return { cap: left > 0 ? Math.floor(left / open) : 0, category, categoryTarget: Math.round(categoryTarget), qty, open, spentByOthers: Math.round(spentByOthers) };
}
