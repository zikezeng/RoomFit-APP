// Deterministic, transparent style ranking (stand-in for CLIP). Style ranks only among products that fit.
import { productsIn } from "./catalog";
import { CategoryId, Product, StylePrefs } from "./types";

export function styleScore(p: Product, prefs: StylePrefs): number {
  let s = 0;
  p.styles.forEach((st, i) => {
    if (prefs.styles.includes(st)) s += i === 0 ? 2 : 1;
  });
  if (prefs.moods.includes(p.mood)) s += 1;
  return s;
}

export const rankForCategory = (cat: CategoryId, prefs: StylePrefs) =>
  productsIn(cat).sort((a, b) => styleScore(b, prefs) - styleScore(a, prefs) || a.price - b.price);

export function typicalCost(cat: CategoryId, prefs: StylePrefs) {
  const top = rankForCategory(cat, prefs).slice(0, 3);
  return Math.round(top.reduce((s, p) => s + p.price, 0) / top.length);
}
