"""
RoomFit floor plan -> 3D model.

Pipeline
--------
1. Recognition: CubiCasa5K (via the CubicasaRoomSegmentation repo) predicts, per pixel,
   a room class (wall, kitchen, bedroom, ...) and an icon class (door, window, ...).
2. Geometry:    the masks are cleaned and turned into real-world geometry in metres:
                wall outlines, door / window openings and typed room polygons.
3. 3D:          walls are extruded to ceiling height with openings cut for doors
                (lintel above) and windows (sill below, glass, lintel above); each room
                gets a floor coloured by its type. Exported as a .glb file (opens in any
                3D viewer, three.js, Blender, or <model-viewer> on the web / in the app).

Outputs per plan (in <out_dir>/<plan name>/):
    model.glb        3D model
    floorplan.json   rooms / doors / windows / walls in metres (for the RoomFit app)
    overlay.png      what was recognised, drawn on the original plan (for checking)

Usage
-----
    python roomfit_3d.py --checkpoint weights/cubicasa5k.pkl --image plan.png --sqft 650

    # programmatic
    from roomfit_3d import RoomFit3D
    rf = RoomFit3D("weights/cubicasa5k.pkl")
    result = rf.run("plan.png", out_dir="out", sqft=650)

`--sqft` (the apartment size the user already enters in RoomFit) sets the real-world
scale. Without it the scale is estimated from wall thickness, which is only approximate.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import trimesh
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROOM_CLASSES = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room", "Bedroom",
                "Bath", "Hallway", "Railing", "Storage", "Garage", "Undefined"]
ICON_CLASSES = ["No Icon", "Window", "Door", "Closet", "Electrical Appliance", "Toilet", "Sink",
                "Sauna Bench", "Fire Place", "Bathtub", "Chimney"]
ICON_WINDOW, ICON_DOOR, ICON_CLOSET, ICON_APPLIANCE, ICON_TOILET, ICON_SINK, ICON_BATHTUB = 1, 2, 3, 4, 5, 6, 9
TYPICAL_DOOR_WIDTH = 0.85  # m, interior doors are ~0.8-0.9 m

# RoomFit room types (match the app's room picker)
ROOMFIT_TYPE = {
    "Kitchen": "kitchen", "Living Room": "living", "Bedroom": "bedroom", "Bath": "bathroom",
    "Hallway": "hallway", "Storage": "closet", "Outdoor": "balcony", "Garage": "other",
    "Undefined": "other",
}
FLOOR_COLORS = {  # warm, light palette (RGBA)
    "living": (214, 184, 140, 255), "bedroom": (160, 190, 210, 255),
    "kitchen": (226, 178, 110, 255), "bathroom": (222, 160, 160, 255),
    "hallway": (214, 204, 140, 255), "closet": (190, 165, 130, 255),
    "balcony": (160, 196, 150, 255), "other": (205, 200, 190, 255),
}
WALL_COLOR = (247, 245, 240, 255)
TRIM_COLOR = (196, 190, 180, 255)
GLASS_COLOR = (150, 195, 225, 110)
BASE_COLOR = (205, 200, 190, 255)

SQFT_TO_M2 = 0.09290304


@dataclass
class Settings:
    wall_height: float = 2.7      # m
    door_height: float = 2.1      # m
    sill_height: float = 0.9      # m
    window_top: float = 2.1       # m
    assumed_wall_thickness: float = 0.15  # m, only used when sqft is not given
    min_room_m2: float = 1.0


@dataclass
class Geometry:
    scale: float                          # metres per pixel
    scale_source: str
    image_size: tuple                     # (w, h) px
    walls: object                         # shapely (Multi)Polygon, px
    doors: list = field(default_factory=list)    # shapely polygons, px
    windows: list = field(default_factory=list)  # shapely polygons, px
    rooms: list = field(default_factory=list)    # dicts: polygon(px), type, label, conf
    footprint: object = None


# ---------------------------------------------------------------------------
# 1. Recognition
# ---------------------------------------------------------------------------

class Recognizer:
    """Thin wrapper around CubicasaRoomSegmentation that keeps masks aligned with the image.

    The upstream repo pads the image to a multiple of 32 and then resizes the *padded*
    prediction back to the original size, which shifts everything by up to 31 px. Here
    the padding is cropped away first.
    """

    def __init__(self, checkpoint: str, repo_dir: str | None = None, device: str | None = None):
        if repo_dir:
            sys.path.insert(0, str(repo_dir))
        import torch  # noqa
        from model import CubiCasa5K  # from CubicasaRoomSegmentation

        self.torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = CubiCasa5K.from_pretrained(checkpoint, device=self.device)
        self.model.eval()

    def predict(self, image_rgb: np.ndarray, max_side: int = 1400):
        torch = self.torch
        h0, w0 = image_rgb.shape[:2]
        s = min(1.0, max_side / max(h0, w0))
        img = cv2.resize(image_rgb, (round(w0 * s), round(h0 * s)), interpolation=cv2.INTER_AREA) if s < 1 else image_rgb
        h, w = img.shape[:2]
        H, W = math.ceil(h / 32) * 32, math.ceil(w / 32) * 32
        pad = np.full((H, W, 3), 255, np.uint8)
        pad[:h, :w] = img
        x = pad.astype(np.float32) / 255.0
        x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
        t = torch.from_numpy(x).permute(2, 0, 1)[None].to(self.device)
        with torch.no_grad():
            out = self.model(t)[0]
            out = torch.nn.functional.interpolate(out[None], size=(H, W), mode="bilinear", align_corners=False)[0]
            out = out[:, :h, :w]
            out = torch.nn.functional.interpolate(out[None], size=(h0, w0), mode="bilinear", align_corners=False)[0]
            rooms = torch.softmax(out[21:33], 0)   # 12 room classes
            icons = torch.softmax(out[33:44], 0)   # 11 icon classes
            room_mask = rooms.argmax(0).cpu().numpy().astype(np.int32)
            icon_mask = icons.argmax(0).cpu().numpy().astype(np.int32)
        return room_mask, icon_mask


# ---------------------------------------------------------------------------
# 2. Geometry extraction
# ---------------------------------------------------------------------------

def _k(n):
    n = max(1, int(round(n)))
    return cv2.getStructuringElement(cv2.MORPH_RECT, (n, n))


def _mask_to_polys(mask: np.ndarray, simplify: float = 1.5, min_area: float = 0) -> list:
    """Binary mask -> list of shapely polygons (holes kept)."""
    cnts, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    if hier is None:
        return polys
    hier = hier[0]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1 or len(c) < 3:
            continue
        holes = []
        j = hier[i][2]
        while j != -1:
            if len(cnts[j]) >= 3:
                holes.append(make_valid(Polygon(cnts[j][:, 0, :].astype(float))).buffer(0))
            j = hier[j][0]
        # outer minus holes (building Polygon(outer, holes) directly loses holes that touch
        # the outline, which turned whole rooms into solid blocks)
        p = make_valid(Polygon(c[:, 0, :].astype(float))).buffer(0)
        if holes:
            p = p.difference(unary_union(holes))
        if simplify:
            p = p.simplify(simplify, preserve_topology=True)
        for g in getattr(p, "geoms", [p]):
            if isinstance(g, Polygon) and g.area > min_area:
                polys.append(g)
    return polys


def _largest_component(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask.astype(np.uint8), None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[i, :4]
    return (lab == i).astype(np.uint8), (x, y, w, h)


def _wall_thickness_px(wall: np.ndarray) -> float:
    dist = cv2.distanceTransform(wall.astype(np.uint8), cv2.DIST_L2, 5)
    # ridge pixels of the distance map = wall centre lines
    ridge = (dist >= cv2.dilate(dist, _k(3))) & (dist > 1)
    vals = dist[ridge]
    if vals.size == 0:
        return 6.0
    return float(np.median(vals) * 2)


def _long_side(p: Polygon) -> float:
    rr = p.minimum_rotated_rectangle
    xs, ys = rr.exterior.coords.xy
    return max(math.dist((xs[i], ys[i]), (xs[i + 1], ys[i + 1])) for i in range(2))


def _classify_room(room_px: np.ndarray, icon_px: np.ndarray, area_m2: float, scale: float,
                   has_window: bool):
    """Name a room from the model's per-pixel vote, then sanity-check it with the fixtures
    found inside it (toilet/bathtub -> bathroom, etc.) and its size. The app lets the user
    confirm or change every room type, so this only needs to be a good first guess."""
    votes = np.bincount(room_px.ravel(), minlength=len(ROOM_CLASSES)).astype(float)
    votes[[0, 2, 8]] = 0  # background, wall, railing don't name a room
    total = votes.sum() or 1.0
    named = votes.copy(); named[11] = 0
    if named.sum() / total > 0.2:
        j = int(np.argmax(named)); cls, conf = ROOM_CLASSES[j], named[j] / total
    else:
        cls, conf = "Undefined", votes[11] / total
    icons = np.bincount(icon_px.ravel(), minlength=len(ICON_CLASSES)).astype(float) * scale * scale  # m2
    plumbing = icons[ICON_TOILET] + icons[ICON_BATHTUB]
    rtype = ROOMFIT_TYPE.get(cls, "other")
    why = f"model: {cls}"

    if plumbing > 0.05 and area_m2 < 15:
        rtype, why = "bathroom", "toilet / bathtub found"
    elif rtype == "bathroom" and plumbing <= 0.05 and icons[ICON_SINK] < 0.05 and area_m2 > 9:
        rtype, why = "other", "model said bath but no fixtures"
    elif rtype in ("other", "closet") and area_m2 < 4.5:
        rtype, why = "closet", "small room"
    elif rtype == "other" and icons[ICON_APPLIANCE] + icons[ICON_SINK] > 0.15 and area_m2 >= 4.5:
        rtype, why = "kitchen", "appliances + sink found"
    elif rtype == "other" and area_m2 >= 7:
        rtype, why = ("bedroom" if has_window else "other"), "size" + (" + window" if has_window else "")
    elif rtype == "hallway" and area_m2 > 15:
        rtype, why = "living", "large open space"
    return cls, rtype, conf, why


def _resolve_living(rooms: list, scale: float):
    """Open-plan apartments: the living room and kitchen are one space. Make sure the plan
    has a living room by promoting the largest open space."""
    if any(r["type"] == "living" for r in rooms) or not rooms:
        return
    cands = [r for r in rooms if r["type"] in ("kitchen", "bedroom", "other", "hallway")]
    if not cands:
        return
    big = max(cands, key=lambda r: r["polygon"].area)
    if big["polygon"].area * scale * scale < 10:
        return
    if big["type"] == "kitchen":
        big["label_override"] = "Living & Kitchen"
    big["type"], big["reason"] = "living", big["reason"] + "; largest open space -> living"


def extract_geometry(room_mask: np.ndarray, icon_mask: np.ndarray, sqft: float | None = None,
                     settings: Settings = Settings()) -> Geometry:
    h, w = room_mask.shape
    wall_raw = (room_mask == 2).astype(np.uint8)

    # --- keep only the floor plan itself (drops screenshot UI, legends, text) ---
    wall = cv2.morphologyEx(wall_raw, cv2.MORPH_OPEN, _k(3))
    main, bbox = _largest_component(wall)
    if bbox is None:
        raise ValueError("No walls were recognised in this image.")
    bx, by, bw, bh = bbox
    t_px = _wall_thickness_px(main)
    margin = int(max(bw, bh) * 0.04)
    roi = np.zeros_like(wall)
    roi[max(0, by - margin):by + bh + margin, max(0, bx - margin):bx + bw + margin] = 1
    n, lab, st, _ = cv2.connectedComponentsWithStats(wall * roi, 8)
    keep = np.zeros(n, np.uint8)
    keep[1:] = st[1:, cv2.CC_STAT_AREA] > max(20, (t_px ** 2) * 3)
    wall = keep[lab].astype(np.uint8)
    # Real walls are thin. Large solid blobs are usually a misread room (or a filled shaft) and
    # would become a huge block in 3D, so drop blobs much thicker than a wall.
    thick = cv2.morphologyEx(wall, cv2.MORPH_OPEN, _k(t_px * 3))
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(thick, 8)
    big = np.zeros(n2, np.uint8)
    big[1:] = st2[1:, cv2.CC_STAT_AREA] > (t_px * 8) ** 2
    blob = cv2.dilate(big[lab2], _k(t_px * 0.5))
    wall = (wall & (1 - blob)).astype(np.uint8)
    wall = cv2.morphologyEx(wall, cv2.MORPH_CLOSE, _k(max(3, t_px * 0.5)))

    # --- doors / windows ---
    window_m = cv2.morphologyEx(((icon_mask == ICON_WINDOW) * roi).astype(np.uint8), cv2.MORPH_OPEN, _k(2))
    door_m = cv2.morphologyEx(((icon_mask == ICON_DOOR) * roi).astype(np.uint8), cv2.MORPH_OPEN, _k(2))

    # --- footprint (inside of the outer wall) ---
    barrier = cv2.morphologyEx(np.maximum(wall, np.maximum(window_m, door_m)), cv2.MORPH_CLOSE, _k(t_px * 4))
    ff = barrier.copy() * 255
    ffmask = np.zeros((h + 2, w + 2), np.uint8)
    # flood the outside from the image border
    outside = np.zeros_like(barrier)
    for (sx, sy) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if ff[sy, sx] == 0:
            cv2.floodFill(ff, ffmask, (sx, sy), 128)
    outside = (ff == 128).astype(np.uint8)
    footprint = (1 - outside).astype(np.uint8)
    footprint = cv2.morphologyEx(footprint, cv2.MORPH_OPEN, _k(t_px))

    # --- rooms: spaces enclosed by walls (door gaps bridged), typed by majority vote ---
    closed = cv2.morphologyEx(np.maximum(wall, door_m), cv2.MORPH_CLOSE, _k(t_px * 5))
    free = ((1 - closed) * footprint).astype(np.uint8)
    free = cv2.morphologyEx(free, cv2.MORPH_OPEN, _k(t_px * 0.8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(free, 4)

    doors = [p for p in _mask_to_polys(door_m, simplify=1.0, min_area=t_px * t_px * 0.5)]
    windows = [p for p in _mask_to_polys(window_m, simplify=1.0, min_area=t_px * t_px * 0.5)]

    # --- scale (metres per pixel) ---
    door_widths = sorted(_long_side(p) for p in doors)
    if sqft:
        interior_px = float(((1 - wall) * footprint).sum())
        scale = math.sqrt(sqft * SQFT_TO_M2 / max(interior_px, 1.0))
        scale_source = f"apartment size ({sqft:g} sq ft)"
    elif len(door_widths) >= 2:
        scale = TYPICAL_DOOR_WIDTH / float(np.median(door_widths))
        scale_source = "estimated from door widths (~0.85 m); enter sq ft for accuracy"
    else:
        scale = settings.assumed_wall_thickness / max(t_px, 1.0)
        scale_source = f"estimated from wall thickness (~{settings.assumed_wall_thickness} m); enter sq ft for accuracy"

    # give every floor pixel inside the apartment to its nearest room, so floors run all the
    # way to the walls (also under fixtures like bathtubs and counters)
    from scipy import ndimage
    valid = np.zeros(n, bool)
    valid[1:] = st[1:, cv2.CC_STAT_AREA] * scale * scale >= settings.min_room_m2
    seeds = np.where(valid[lab], lab, 0)
    _, (iy, ix) = ndimage.distance_transform_edt(seeds == 0, return_indices=True)
    owner = seeds[iy, ix] * ((1 - wall) * footprint).astype(bool)

    rooms = []
    for i in range(1, n):
        if not valid[i]:
            continue
        area_m2 = st[i, cv2.CC_STAT_AREA] * scale * scale
        region = lab == i
        grown = cv2.morphologyEx((owner == i).astype(np.uint8), cv2.MORPH_OPEN, _k(t_px * 0.6))
        cls, rtype, conf, why = _classify_room(room_mask[region], icon_mask[grown.astype(bool)], area_m2,
                                               scale, has_window=bool(window_m[cv2.dilate(grown, _k(t_px * 3)).astype(bool)].any()))
        polys = _mask_to_polys(grown, simplify=max(1.0, t_px * 0.3), min_area=st[i, cv2.CC_STAT_AREA] * 0.3)
        if not polys:
            continue
        poly = max(polys, key=lambda p: p.area)
        rooms.append({"polygon": poly, "class": cls, "type": rtype, "confidence": round(float(conf), 2),
                      "reason": why})

    _resolve_living(rooms, scale)

    # --- label rooms: Bedroom 1, Bedroom 2 ... ---
    counts, seen = {}, {}
    for r in rooms:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    names = {"living": "Living Room", "bedroom": "Bedroom", "kitchen": "Kitchen", "bathroom": "Bathroom",
             "hallway": "Hallway", "closet": "Closet", "balcony": "Balcony", "other": "Room"}
    for r in sorted(rooms, key=lambda r: (r["polygon"].centroid.y, r["polygon"].centroid.x)):
        t = r["type"]
        seen[t] = seen.get(t, 0) + 1
        r["label"] = r.pop("label_override", None) or names[t] + (f" {seen[t]}" if counts[t] > 1 else "")

    walls = unary_union(_mask_to_polys(wall, simplify=max(1.0, t_px * 0.25), min_area=t_px * t_px))
    fp = unary_union(_mask_to_polys(footprint, simplify=max(1.0, t_px * 0.3), min_area=(t_px * 10) ** 2))
    return Geometry(scale=scale, scale_source=scale_source, image_size=(w, h), walls=walls,
                    doors=doors, windows=windows, rooms=rooms, footprint=fp)


# ---------------------------------------------------------------------------
# 3. 3D model
# ---------------------------------------------------------------------------

def _to_plane(geom, s):
    """px (y down) -> metres in a right-handed XY plane (y up)."""
    from shapely import affinity
    return affinity.affine_transform(geom, [s, 0, 0, -s, 0, 0])


def _polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon) and not p.is_empty]


def _extrude(geom, z0, z1, color, min_area=1e-4):
    meshes = []
    for p in _polys(make_valid(geom).buffer(0)):
        if p.area < min_area or z1 - z0 <= 1e-4:
            continue
        m = trimesh.creation.extrude_polygon(p, z1 - z0)
        m.apply_translation([0, 0, z0])
        m.metadata["color"] = tuple(color)
        meshes.append(m)
    return meshes


def _material(color, name):
    from trimesh.visual.material import PBRMaterial
    lin = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
    rgba = [lin(c) for c in color[:3]] + [color[3] / 255]  # glTF colour factors are linear
    return PBRMaterial(name=name, baseColorFactor=rgba, metallicFactor=0.0, roughnessFactor=0.9,
                       alphaMode="BLEND" if color[3] < 255 else "OPAQUE", doubleSided=color[3] < 255)


def build_scene(geo: Geometry, settings: Settings = Settings()) -> trimesh.Scene:
    s = geo.scale
    t = 0.05 / s  # a few cm in px, used to make openings cut fully through walls
    walls = make_valid(geo.walls).buffer(0)
    door_u = unary_union([d.buffer(t * 2, cap_style=3, join_style=2) for d in geo.doors]) if geo.doors else Polygon()
    win_u = unary_union([wn.buffer(t * 2, cap_style=3, join_style=2) for wn in geo.windows]) if geo.windows else Polygon()

    solid = walls.difference(door_u).difference(win_u)
    door_in_wall = walls.intersection(door_u)
    win_in_wall = walls.intersection(win_u).difference(door_u)
    # door openings that are a gap in the wall mask: put a lintel over the gap
    gap_lintel = Polygon()
    if geo.doors:
        bridged = walls.buffer(t * 6).buffer(-t * 6)
        gap_lintel = bridged.difference(walls).intersection(door_u.buffer(t * 4))

    P = lambda g: _to_plane(g, s)
    H, D, S, WT = settings.wall_height, settings.door_height, settings.sill_height, settings.window_top
    parts = {"walls": [], "trim": [], "glass": [], "floors": [], "base": []}
    parts["walls"] += _extrude(P(solid), 0, H, WALL_COLOR)
    parts["walls"] += _extrude(P(unary_union([door_in_wall, gap_lintel])), D, H, WALL_COLOR)
    parts["walls"] += _extrude(P(win_in_wall), 0, S, WALL_COLOR)
    parts["walls"] += _extrude(P(win_in_wall), WT, H, WALL_COLOR)
    # thin glass pane in the middle of each window
    for wn in _polys(win_in_wall):
        parts["glass"] += _extrude(P(wn), S, WT, GLASS_COLOR)
    # floors
    base = geo.footprint if geo.footprint is not None and not geo.footprint.is_empty else walls.convex_hull
    parts["base"] += _extrude(P(base.buffer(t)), -0.06, 0.0, BASE_COLOR)
    floors_by_type = {}
    for r in geo.rooms:
        floors_by_type.setdefault(r["type"], []).extend(
            _extrude(P(r["polygon"].difference(walls)), 0.0, 0.01, FLOOR_COLORS[r["type"]]))

    groups = {"walls": (parts["walls"], WALL_COLOR), "glass": (parts["glass"], GLASS_COLOR),
              "base": (parts["base"], BASE_COLOR)}
    for t_, ms in floors_by_type.items():
        groups[f"floor_{t_}"] = (ms, FLOOR_COLORS[t_])

    scene = trimesh.Scene()
    rot = trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0])  # Z-up -> Y-up (glTF)
    for name, (ms, color) in groups.items():
        if not ms:
            continue
        m = trimesh.util.concatenate(ms)
        m.apply_transform(rot)
        m.unmerge_vertices()  # flat shading: crisp wall edges
        m.visual = trimesh.visual.TextureVisuals(material=_material(color, name))
        scene.add_geometry(m, node_name=name, geom_name=name)
    return scene


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

def _coords_m(poly: Polygon, s: float):
    return [[round(x * s, 3), round(y * s, 3)] for x, y in list(poly.exterior.coords)[:-1]]


def geometry_to_json(geo: Geometry, settings: Settings) -> dict:
    s = geo.scale
    out = {
        "units": "metres; x to the right, y down (same orientation as the image)",
        "scale_m_per_px": round(s, 6), "scale_source": geo.scale_source,
        "image_size_px": list(geo.image_size),
        "wall_height_m": settings.wall_height,
        "rooms": [], "doors": [], "windows": [], "walls": [],
    }
    total = 0.0
    for r in geo.rooms:
        p = r["polygon"]
        a = p.area * s * s
        total += a
        out["rooms"].append({"label": r["label"], "type": r["type"], "model_class": r["class"],
                             "confidence": r["confidence"], "why": r.get("reason", ""), "area_m2": round(a, 2),
                             "area_sqft": round(a / SQFT_TO_M2, 1),
                             "centroid": [round(p.centroid.x * s, 3), round(p.centroid.y * s, 3)],
                             "polygon": _coords_m(p, s)})
    for key, items in (("doors", geo.doors), ("windows", geo.windows)):
        for p in items:
            rr = p.minimum_rotated_rectangle
            xs, ys = rr.exterior.coords.xy
            edges = [math.dist((xs[i], ys[i]), (xs[i + 1], ys[i + 1])) for i in range(2)]
            out[key].append({"center": [round(p.centroid.x * s, 3), round(p.centroid.y * s, 3)],
                             "width_m": round(max(edges) * s, 2), "polygon": _coords_m(p, s)})
    for p in _polys(geo.walls):
        out["walls"].append({"outline": _coords_m(p, s),
                             "holes": [[[round(x * s, 3), round(y * s, 3)] for x, y in list(i.coords)[:-1]] for i in p.interiors]})
    out["total_room_area_m2"] = round(total, 2)
    out["total_room_area_sqft"] = round(total / SQFT_TO_M2, 1)
    return out


def draw_overlay(image_rgb: np.ndarray, geo: Geometry) -> np.ndarray:
    vis = image_rgb.copy()
    layer = vis.copy()
    for r in geo.rooms:
        c = FLOOR_COLORS[r["type"]][:3]
        pts = np.array(r["polygon"].exterior.coords, np.int32)
        cv2.fillPoly(layer, [pts], c)
    vis = cv2.addWeighted(layer, 0.55, vis, 0.45, 0)
    for p in _polys(geo.walls):
        cv2.polylines(vis, [np.array(p.exterior.coords, np.int32)], True, (60, 60, 60), 2)
        for i in p.interiors:
            cv2.polylines(vis, [np.array(i.coords, np.int32)], True, (60, 60, 60), 2)
    for p in geo.doors:
        cv2.fillPoly(vis, [np.array(p.exterior.coords, np.int32)], (40, 170, 90))
    for p in geo.windows:
        cv2.fillPoly(vis, [np.array(p.exterior.coords, np.int32)], (40, 120, 220))
    fs = max(0.4, min(vis.shape[:2]) / 1400)
    for r in geo.rooms:
        c = r["polygon"].representative_point()
        a = r["polygon"].area * geo.scale ** 2
        for k, txt in enumerate([r["label"], f"{a:.1f} m2"]):
            org = (int(c.x) - 40, int(c.y) + int(k * 26 * fs * 1.6))
            cv2.putText(vis, txt, org, cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), 4, cv2.LINE_AA)
            cv2.putText(vis, txt, org, cv2.FONT_HERSHEY_SIMPLEX, fs, (30, 30, 30), 1, cv2.LINE_AA)
    return vis


class RoomFit3D:
    def __init__(self, checkpoint: str, repo_dir: str | None = None, device: str | None = None,
                 settings: Settings = Settings()):
        self.recognizer = Recognizer(checkpoint, repo_dir, device)
        self.settings = settings

    def run(self, image_path: str, out_dir: str = "roomfit_3d_out", sqft: float | None = None):
        image_path = Path(image_path)
        rgb = cv2.cvtColor(cv2.imread(str(image_path)), cv2.COLOR_BGR2RGB)
        room_mask, icon_mask = self.recognizer.predict(rgb)
        geo = extract_geometry(room_mask, icon_mask, sqft=sqft, settings=self.settings)
        out = Path(out_dir) / image_path.stem
        out.mkdir(parents=True, exist_ok=True)
        build_scene(geo, self.settings).export(out / "model.glb")
        data = geometry_to_json(geo, self.settings)
        (out / "floorplan.json").write_text(json.dumps(data, indent=2))
        cv2.imwrite(str(out / "overlay.png"), cv2.cvtColor(draw_overlay(rgb, geo), cv2.COLOR_RGB2BGR))
        np.save(out / "room_mask.npy", room_mask.astype(np.uint8))
        np.save(out / "icon_mask.npy", icon_mask.astype(np.uint8))
        return {"dir": str(out), "geometry": geo, "json": data}


def main():
    ap = argparse.ArgumentParser(description="RoomFit: floor plan image -> 3D model (.glb)")
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--repo_dir", default=".", help="path to CubicasaRoomSegmentation")
    ap.add_argument("--image", nargs="+", required=True)
    ap.add_argument("--sqft", type=float, default=None, help="apartment size, sets real-world scale")
    ap.add_argument("--out_dir", default="roomfit_3d_out")
    ap.add_argument("--wall_height", type=float, default=2.7)
    ap.add_argument("--device", default=None)
    a = ap.parse_args()
    rf = RoomFit3D(a.checkpoint, a.repo_dir, a.device, Settings(wall_height=a.wall_height))
    for img in a.image:
        r = rf.run(img, a.out_dir, a.sqft)
        j = r["json"]
        print(f"{img} -> {r['dir']}")
        print(f"  {len(j['rooms'])} rooms, {len(j['doors'])} doors, {len(j['windows'])} windows, "
              f"{j['total_room_area_sqft']} sq ft  [scale: {j['scale_source']}]")
        for room in j["rooms"]:
            print(f"    - {room['label']:<14} {room['area_m2']:>6} m2  (confidence {room['confidence']})")


if __name__ == "__main__":
    main()
