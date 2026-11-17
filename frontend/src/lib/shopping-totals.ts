import { getProduct } from "./catalog";
import { PlacedItem, RealProductSelection } from "./types";

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
export function budgetNote(t: ShoppingTotals, budget: number, fmt: (n: number) => string): string {
  const remaining = budget - t.spent;
  const pieces = `${t.toChoose} ${t.toChoose === 1 ? "piece" : "pieces"} still to choose`;
  return [
    t.toChoose === 0 ? "All pieces chosen" : remaining > 0 ? `${pieces} · about ${fmt(Math.floor(remaining / t.toChoose))} each` : pieces,
    t.unpriced > 0 ? `${t.unpriced} chosen without a listed price (not counted)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
