"""
Extra facts about ONE real product the user picked in Step 8: its size and its main colour.

Google Shopping search results carry no dimensions, so after the user selects a product the app asks
this service to look the product up once more (SerpAPI "google_immersive_product"). From that answer we
try to read width / depth / height (specs first, then the description, then the title) and we work out
the product's main colour from a clean product photo. Anything we cannot find stays None — the app then
shows "size unknown" instead of guessing.

This file has no heavy imports so it can be tested on its own:  python product_details.py
"""

from __future__ import annotations

import io
import re
from collections import Counter
from typing import Callable, Optional

CM = {"cm": 1.0, "mm": 0.1, "m": 100.0, "in": 2.54, "ft": 30.48}

_NUM = r"(\d+(?:\.\d+)?(?:\s+\d+\s*/\s*\d+)?|\d+\s*/\s*\d+)"  # 77 | 77.5 | 70 7/8 | 7/8
_UNIT = r"(centimeters?|centimetres?|cm|millimeters?|millimetres?|mm|inches|inch|in\.?|feet|foot|ft\.?|''|\"|”|″|'|’|′|m)"
_AXIS_WORD = {
    "w": "width", "width": "width", "wide": "width", "l": "width", "length": "width", "long": "width",
    "d": "depth", "depth": "depth", "deep": "depth",
    "h": "height", "height": "height", "high": "height", "tall": "height",
}


def _num(text: str) -> float:
    text = text.strip()
    total = 0.0
    for part in text.split():
        part = part.replace(" ", "")
        if "/" in part:
            a, b = part.split("/")
            total += float(a) / float(b) if float(b) else 0.0
        else:
            total += float(part)
    return total


def _unit(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    u = raw.strip().lower().rstrip(".")
    if u in ('"', "”", "″", "''", "in", "inch", "inches"):
        return "in"
    if u in ("'", "’", "′", "ft", "foot", "feet"):
        return "ft"
    if u.startswith("cent") or u == "cm":
        return "cm"
    if u.startswith("mill") or u == "mm":
        return "mm"
    if u == "m":
        return "m"
    return None


def _cm(value: float, unit: Optional[str]) -> Optional[float]:
    if unit is None:
        return None
    cm = value * CM[unit]
    return round(cm, 1) if 3 <= cm <= 500 else None


def _clean(text: str) -> str:
    text = re.sub(r"(\d)\s+(\d+\s*/\s*\d+)", r"\1 \2", text)  # keep "70 7/8" together
    return text.replace("×", "x").replace("–", "-").replace(" ", " ")


def parse_dimensions(text: str, hint: str = "") -> dict:
    """Read width/depth/height (cm) out of free text. `hint` is the spec's name, e.g. 'Dimensions (L x W x H)'."""
    out: dict = {"width": None, "depth": None, "height": None}
    if not text:
        return out
    t = _clean(text)

    # 1) each number carries its own letter: 30"D x 77"W x 33"H  /  77 in W x 30 in D x 33 in H
    lettered = re.findall(rf"{_NUM}\s*{_UNIT}?\s*-?\s*(wide|width|deep|depth|high|height|tall|long|length|[wdhl])\b", t, flags=re.I)
    if len(lettered) >= 2:
        fallback = next((_unit(u) for _, u, _ in lettered if _unit(u)), None) or _unit((re.search(_UNIT, t, flags=re.I) or [None])[0])
        for n, u, axis in lettered:
            key = _AXIS_WORD[axis.lower()]
            value = _cm(_num(n), _unit(u) or fallback)
            if value and out[key] is None:
                out[key] = value
        if sum(v is not None for v in out.values()) >= 2:
            return out
        out = {"width": None, "depth": None, "height": None}

    # 1b) letter first: W 55cm x D 40cm x H 45cm
    prefixed = re.findall(rf"\b([wdhl])\s*[:=]?\s*{_NUM}\s*{_UNIT}?", t, flags=re.I)
    if len(prefixed) >= 2:
        fallback = next((_unit(u) for _, _, u in prefixed if _unit(u)), None)
        for axis, n, u in prefixed:
            key = _AXIS_WORD[axis.lower()]
            value = _cm(_num(n), _unit(u) or fallback)
            if value and out[key] is None:
                out[key] = value
        if sum(v is not None for v in out.values()) >= 2:
            return out
        out = {"width": None, "depth": None, "height": None}

    # 2) "Width: 70 7/8 in" style, one at a time
    for m in re.finditer(rf"\b(overall\s+|product\s+|assembled\s+)?(width|depth|height|length)\b\s*[:=]?\s*{_NUM}\s*{_UNIT}", t, flags=re.I):
        if re.search(r"(seat|arm|armrest|leg|back|clearance|package|box)\s*$", t[: m.start()].lower()[-12:]):
            continue  # "Armrest height", "Seat depth" are not the overall size
        key = _AXIS_WORD[m.group(2).lower()]
        value = _cm(_num(m.group(3)), _unit(m.group(4)))
        if value and out[key] is None:
            out[key] = value
    if any(v is not None for v in out.values()):
        return out

    # 3) plain triple or pair: 77 x 30 x 33 in   (order from the hint, else W x D x H)
    m = re.search(rf"{_NUM}\s*{_UNIT}?\s*x\s*{_NUM}\s*{_UNIT}?(?:\s*x\s*{_NUM}\s*{_UNIT}?)?", t, flags=re.I)
    if m:
        nums = [m.group(1), m.group(3), m.group(5)]
        units = [_unit(m.group(2)), _unit(m.group(4)), _unit(m.group(6))]
        unit = next((u for u in reversed(units) if u), None)
        if unit is None:
            after = re.match(rf"\s*\(?\s*{_UNIT}", t[m.end():], flags=re.I)
            unit = _unit(after.group(1)) if after else None
        order = ["width", "depth", "height"]
        letters = re.search(r"\(?\b([lwdh])\s*x\s*([lwdh])(?:\s*x\s*([lwdh]))?\b\)?", (hint + " " + t).lower())
        if letters:
            order = [_AXIS_WORD[x] for x in letters.groups() if x]
            if order.count("width") > 1:  # "L x W x H": length is the long side, W is then the depth
                first = order.index("width")
                second = order.index("width", first + 1)
                order[second] = "depth"
        for n, u, key in zip(nums, units, order):
            if n is None:
                continue
            value = _cm(_num(n), u or unit)
            if value and out[key] is None:
                out[key] = value
    return out


def parse_title_size(title: str) -> dict:
    """Titles usually give one number: 'Mainstays 77 in Square Arm Sofa' → width 77 in. Rugs: '5x7 ft'."""
    out: dict = {"width": None, "depth": None, "height": None}
    t = _clean(title or "")
    rug = re.search(rf"\b{_NUM}\s*(?:'|’|′|ft\.?|feet)?\s*x\s*{_NUM}\s*('|’|′|ft\.?|feet)", t, flags=re.I)
    if rug:
        a, b = _cm(_num(rug.group(1)), "ft"), _cm(_num(rug.group(2)), "ft")
        if a and b:
            out["width"], out["depth"] = max(a, b), min(a, b)
            return out
    full = parse_dimensions(t)
    if sum(v is not None for v in full.values()) >= 2:
        return full
    one = re.search(rf"\b{_NUM}\s*-?\s*(inches|inch|in\b\.?|\"|”|″|cm\b)", t, flags=re.I)
    if one:
        out["width"] = _cm(_num(one.group(1)), _unit(one.group(2).strip()))
    return out


_SIZE_KEYS = re.compile(r"dimension|size|width|depth|height|length|measure", re.I)
_PART_KEYS = re.compile(r"seat|arm|leg|back|package|box|shipping|carton|clearance|weight|screen|drawer|shelf|cushion", re.I)


def dimensions_from_product(title: str, features: list, description: str) -> dict:
    """Best size we can find, with where it came from. Each value is cm or None."""
    found: dict = {"width": None, "depth": None, "height": None}
    source = None

    def merge(part: dict, where: str) -> None:
        nonlocal source
        added = False
        for k, v in part.items():
            if v is not None and found[k] is None:
                found[k] = v
                added = True
        if added and source is None:
            source = where

    for f in features or []:
        name, value = str(f.get("title") or ""), str(f.get("value") or "")
        if not _SIZE_KEYS.search(name) or _PART_KEYS.search(name):
            continue
        single = re.fullmatch(r"\s*(?:overall\s+|product\s+|assembled\s+)?(width|depth|height|length)\s*", name, flags=re.I)
        if single:
            m = re.search(rf"{_NUM}\s*{_UNIT}", _clean(value), flags=re.I)
            if m:
                merge({_AXIS_WORD[single.group(1).lower()]: _cm(_num(m.group(1)), _unit(m.group(2)))}, "specs")
        else:
            merge(parse_dimensions(value, hint=name), "specs")
    if not all(found.values()):
        merge(parse_dimensions(description or ""), "description")
    if not all(found.values()):
        merge(parse_title_size(title), "title")

    known = sum(v is not None for v in found.values())
    return {**found, "source": source, "complete": known == 3, "known": known}


# ---------------------------------------------------------------- colour

def dominant_color(image_bytes: bytes) -> Optional[str]:
    """Main colour of the product in a photo, as #rrggbb.

    Only trusts clean product shots (plain light background): the background is whatever colour the
    border has, and the product is everything that differs from it. Room scenes return None."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return None
    img.thumbnail((96, 96))
    w, h = img.size
    if w < 8 or h < 8:
        return None
    px = img.load()
    border = [px[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] + [px[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    near = lambda a, b, t: sum((a[i] - b[i]) ** 2 for i in range(3)) < t * t  # noqa: E731
    plain = sum(near(c, bg, 28) for c in border) / len(border)
    if plain < 0.8 or min(bg) < 200:
        return None  # busy or dark background → a room scene, colour would be the room's
    bins: Counter = Counter()
    sums: dict = {}
    count = 0
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if near(c, bg, 40):
                continue
            count += 1
            key = (c[0] >> 5, c[1] >> 5, c[2] >> 5)
            bins[key] += 1
            s = sums.setdefault(key, [0, 0, 0])
            s[0] += c[0]; s[1] += c[1]; s[2] += c[2]  # noqa: E702
    if count < w * h * 0.06:
        return None
    key, n = bins.most_common(1)[0]
    r, g, b = (round(v / n) for v in sums[key])
    return f"#{r:02x}{g:02x}{b:02x}"


def build_details(payload: dict, fetch_image: Callable[[str], Optional[bytes]]) -> dict:
    """Turn a SerpAPI google_immersive_product answer into what the app needs."""
    pr = payload.get("product_results") or {}
    about = pr.get("about_the_product") or {}
    features = about.get("features") or []
    if isinstance(features, dict):
        features = [{"title": k, "value": v} for k, v in features.items()]
    title = str(pr.get("title") or about.get("title") or "")
    description = str(about.get("description") or "")
    dims = dimensions_from_product(title, features, description)

    color = None
    color_image = None
    thumbs = [t for t in (pr.get("thumbnails") or []) if isinstance(t, str)][:4]
    for url in thumbs:
        data = fetch_image(url)
        color = dominant_color(data) if data else None
        if color:
            color_image = url
            break
    color_name = next((str(f.get("value")) for f in features if str(f.get("title") or "").strip().lower() in ("color", "colour", "color family")), None)

    return {
        "title": title or None,
        "brand": pr.get("brand"),
        "dimensions": dims,
        "color": color,
        "color_name": color_name,
        "image": color_image or (thumbs[0] if thumbs else None),
    }


if __name__ == "__main__":  # quick self-test
    checks = [
        (parse_dimensions('30"D x 77"W x 33"H'), (195.6, 76.2, 83.8)),
        (parse_dimensions("77.00 x 30.00 x 33.00 Inches", hint="Assembled Product Dimensions (L x W x H)"), (195.6, 76.2, 83.8)),
        (parse_dimensions("Width: 70 7/8 in, Depth: 30 3/4 in, Height: 31 1/8 in"), (180.0, 78.1, 79.1)),
        (parse_dimensions("180 x 88 x 80 cm"), (180.0, 88.0, 80.0)),
        (parse_dimensions("W 55cm x D 40cm x H 45cm"), (55.0, 40.0, 45.0)),
        (parse_dimensions("Armrest height: 18 1/2 in"), (None, None, None)),
        (parse_title_size("Mainstays 77 in Square Arm Sofa"), (195.6, None, None)),
        (parse_title_size("nuLOOM 5' x 8' Moroccan Area Rug"), (243.8, 152.4, None)),
        (parse_title_size("IKEA SALTMYRAN loveseat Öreryd"), (None, None, None)),
    ]
    bad = 0
    for got, want in checks:
        tup = (got["width"], got["depth"], got["height"])
        ok = tup == want
        bad += not ok
        print("ok " if ok else "BAD", tup, "expected", want)
    full = dimensions_from_product(
        "Mainstays 77 in Square Arm Sofa",
        [{"title": "Brand", "value": "Mainstays"}, {"title": "Seat Depth", "value": "21 in"}, {"title": "Assembled Product Dimensions (L x W x H)", "value": "77.00 x 30.50 x 33.00 Inches"}],
        "",
    )
    print(full)
    bad += not (full["complete"] and full["source"] == "specs" and full["depth"] == 77.5)
    raise SystemExit(1 if bad else 0)
