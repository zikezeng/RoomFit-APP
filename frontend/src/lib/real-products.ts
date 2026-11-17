import { CATEGORY_MAP, STYLE_LABEL } from "./catalog";
import { CategoryId, MoodId, RealProductDetails, StyleId } from "./types";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface RealShoppingProduct {
  id: string;
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
  page_token?: string | null;
}

interface SearchResponse {
  query: string;
  provider: string;
  products: RealShoppingProduct[];
}

const MOOD_LABEL: Record<MoodId, string> = {
  warm: "warm cozy",
  bright: "light bright",
  bold: "bold statement",
};

export async function searchRealProducts(input: {
  category: CategoryId;
  styles: StyleId[];
  moods: MoodId[];
  /** Price limit for this spot (USD), from the real remaining budget. null = no limit in the search. */
  maxPrice: number | null;
}): Promise<RealShoppingProduct[]> {
  if (!API) throw new Error("RoomFit backend URL is not configured.");

  const category = CATEGORY_MAP[input.category]?.label ?? input.category;
  const style = input.styles[0] ? STYLE_LABEL[input.styles[0]] : "";
  const mood = input.moods[0] ? MOOD_LABEL[input.moods[0]] : "";
  // Round up to a friendly number; very small shares are dropped so the search is not starved.
  const cap = input.maxPrice !== null && input.maxPrice >= 30 ? Math.ceil(input.maxPrice / 10) * 10 : null;
  const query = [style, mood, category, "furniture", cap ? `under $${cap}` : ""].filter(Boolean).join(" ");

  const res = await fetch(
    `${API}/api/products/search?q=${encodeURIComponent(query)}&limit=6`,
  );
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Shopping search failed (${res.status}).`);
  }

  return (body as SearchResponse).products ?? [];
}

export const NO_DETAILS: RealProductDetails = { status: "unavailable", width: null, depth: null, height: null, source: null, color: null, colorName: null };
export const LOADING_DETAILS: RealProductDetails = { ...NO_DETAILS, status: "loading" };

/** Ask the server for one selected product's real size and main colour (one extra lookup, cached). */
export async function fetchProductDetails(pageToken: string): Promise<RealProductDetails> {
  if (!API) throw new Error("RoomFit backend URL is not configured.");
  const res = await fetch(`${API}/api/products/detail?token=${encodeURIComponent(pageToken)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Product lookup failed (${res.status}).`);
  }
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
  const d = body.dimensions ?? {};
  const source = d.source === "specs" || d.source === "description" || d.source === "title" ? d.source : null;
  const color = typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : null;
  return { status: "ok", width: num(d.width), depth: num(d.depth), height: num(d.height), source, color, colorName: typeof body.color_name === "string" ? body.color_name : null };
}
