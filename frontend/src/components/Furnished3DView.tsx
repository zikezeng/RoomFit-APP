// Furnished 3D preview: the room(s) and every piece of the chosen layout, drawn with three.js inside a
// WebView on phones (works in Expo Go) and an iframe in the web preview — the same approach as Model3DView.
// The scene is built in the browser from plain data (src/lib/furnished3d.ts); no server is needed.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import type { Scene3D } from "@/src/lib/furnished3d";
import { ThemeColors, useTheme } from "@/src/theme";

export type Scene3DViewName = "default" | "top";
export interface Furnished3DHandle {
  setView: (view: Scene3DViewName) => void;
}
interface Props {
  scene: Scene3D;
  selectedUid?: string | null;
  showLabels?: boolean;
  onSelect?: (uid: string | null) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

const palette = (c: ThemeColors) => ({
  bg: c.surfaceTertiary,
  wall: c.surfaceSecondary,
  base: c.borderStrong,
  glass: c.info,
  door: c.surface,
  accent: c.brandPrimary,
  text: c.onSurface,
  muted: c.muted,
  labelBg: c.surfaceSecondary,
  plant: c.success,
  lamp: c.warning,
  dark: c.surfaceInverse,
  soft: c.brandSecondary,
  linen: c.surface,
  wood: c.wood,
  woodDark: c.woodDark,
});

// Runs inside the WebView / iframe. Kept as one string so it works the same on phone and web.
const VIEWER_JS = String.raw`
const DATA = window.__SCENE__, P = window.__PALETTE__, INIT = window.__INIT__;
const post = (m) => { const s = JSON.stringify(m); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if (window.parent !== window) window.parent.postMessage(s, "*"); };
const fail = (text) => { document.getElementById("msg").textContent = text; document.getElementById("msg").style.display = "flex"; post({ type: "error", text }); };

(async () => {
  let THREE;
  try { THREE = await import("${THREE_URL}"); } catch (e) { return fail("The 3D view needs an internet connection to load. Check the connection and open this page again."); }
  const canvas = document.getElementById("c");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); } catch (e) { return fail("This device could not start the 3D view."); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.bg);

  const M = 0.01; // cm -> m
  const col = (hex, f) => { const c = new THREE.Color(hex); if (f > 0) c.lerp(new THREE.Color(0xffffff), f); if (f < 0) c.lerp(new THREE.Color(0x000000), -f); return c; };
  const mat = (hex, f, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: col(hex, f || 0), roughness: 0.85, metalness: 0 }, extra || {}));

  // ---------- bounds ----------
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  DATA.rooms.forEach((r) => r.poly.forEach((p) => { x0 = Math.min(x0, p.x * M); x1 = Math.max(x1, p.x * M); z0 = Math.min(z0, p.y * M); z1 = Math.max(z1, p.y * M); }));
  const center = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const span = Math.max(x1 - x0, z1 - z0, 2);
  const H = DATA.wallHeight * M;
  const home = DATA.mode === "home";
  const T = home ? 0.07 : 0.1;

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xffffff, col(P.base, 0.5), 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(center.x + span * 0.35, span * 1.5 + 3, center.z + span * 0.6);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.1; sc.far = span * 5 + 10;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---------- floors ----------
  const floorTexture = (hex, tiles) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256; const g = cv.getContext("2d");
    g.fillStyle = "#" + col(hex, 0.12).getHexString(); g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#" + col(hex, -0.12).getHexString(); g.lineWidth = 1.5;
    if (tiles) { for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }
    else {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = "#" + col(hex, 0.04 + ((i * 37) % 5) * 0.035).getHexString(); g.fillRect(0, i * 32, 256, 32);
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke();
        const off = (i * 97) % 256; g.beginPath(); g.moveTo(off, i * 32); g.lineTo(off, i * 32 + 32); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const inPoly = (px, pz, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > pz) !== (b.y > pz) && px < ((b.x - a.x) * (pz - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; };
  const walls = [];
  const sideMat = mat(P.base, 0.1);
  DATA.rooms.forEach((room) => {
    const shape = new THREE.Shape();
    room.poly.forEach((p, i) => (i ? shape.lineTo(p.x * M, -p.y * M) : shape.moveTo(p.x * M, -p.y * M)));
    const tiles = room.kind === "kitchen" || room.kind === "bathroom" || room.kind === "balcony";
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const top = new THREE.MeshStandardMaterial({ map: floorTexture(room.floor, tiles), roughness: 0.9, color: home && !room.furnished ? col("#ffffff", -0.06) : 0xffffff });
    const floor = new THREE.Mesh(geo, [top, sideMat]);
    floor.position.y = -0.08; floor.receiveShadow = true; scene.add(floor);

    // ---------- walls of this room (door gaps, window panes) ----------
    const wallMat = mat(P.wall, -0.03);
    const n = room.poly.length;
    for (let i = 0; i < n; i++) {
      const a = room.poly[i], b = room.poly[(i + 1) % n];
      const ax = a.x * M, az = a.y * M, bx = b.x * M, bz = b.y * M;
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      let nx = uz, nz = -ux;
      if (inPoly(((ax + bx) / 2 + nx * 0.05) / M, ((az + bz) / 2 + nz * 0.05) / M, room.poly)) { nx = -nx; nz = -nz; }
      const group = new THREE.Group(); group.userData.out = [nx, nz]; scene.add(group); walls.push(group);
      const cuts = [];
      DATA.openings.forEach((o) => {
        const pa = [o.a.x * M - ax, o.a.y * M - az], pb = [o.b.x * M - ax, o.b.y * M - az];
        const da = Math.abs(pa[0] * nx + pa[1] * nz), db = Math.abs(pb[0] * nx + pb[1] * nz);
        if (da > 0.45 || db > 0.45) return;
        let s0 = pa[0] * ux + pa[1] * uz, s1 = pb[0] * ux + pb[1] * uz; if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }
        s0 = Math.max(0, s0); s1 = Math.min(len, s1);
        if (s1 - s0 > 0.25) cuts.push({ s0, s1, type: o.type });
      });
      cuts.sort((p, q) => p.s0 - q.s0);
      const piece = (s0, s1, y0, y1, material, thick) => {
        if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return null;
        const m = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, y1 - y0, thick || T), material);
        const mid = (s0 + s1) / 2;
        m.position.set(ax + ux * mid + nx * T / 2, (y0 + y1) / 2, az + uz * mid + nz * T / 2);
        m.rotation.y = -Math.atan2(uz, ux); m.castShadow = home; m.receiveShadow = true; group.add(m); return m;
      };
      let cur = -T;
      cuts.forEach((c) => {
        if (c.s0 < cur) return;
        piece(cur, c.s0, 0, H, wallMat);
        if (c.type === "door") {
          piece(c.s0, c.s1, 2.05, H, wallMat);
          if (!home) {
            const w = c.s1 - c.s0;
            const hinge = new THREE.Group(); hinge.position.set(ax + ux * c.s0, 0, az + uz * c.s0);
            const base = -Math.atan2(uz, ux);
            let ang = base + 1.25; if (Math.cos(ang) * -nx + -Math.sin(ang) * -nz < 0) ang = base - 1.25;
            hinge.rotation.y = ang;
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, 0.04), mat(P.door, -0.02)); leaf.position.set(w / 2, 1.0, 0);
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat(P.dark, 0.2, { metalness: 0.6, roughness: 0.4 })); knob.position.set(w - 0.09, 1.0, 0.04);
            hinge.add(leaf, knob); group.add(hinge);
          }
        } else {
          const sill = Math.min(0.9, H * 0.55), head = Math.min(2.1, H);
          piece(c.s0, c.s1, 0, sill, wallMat);
          piece(c.s0, c.s1, head, H, wallMat);
          const glass = piece(c.s0, c.s1, sill, head, new THREE.MeshStandardMaterial({ color: col(P.glass, 0.55), transparent: true, opacity: 0.45, roughness: 0.1 }), 0.03);
          if (glass) { glass.castShadow = false; }
          const frame = mat(P.wall, -0.25);
          piece(c.s0, c.s1, sill, sill + 0.04, frame, T * 0.7); piece(c.s0, c.s1, head - 0.04, head, frame, T * 0.7);
          const mid = (c.s0 + c.s1) / 2; piece(mid - 0.02, mid + 0.02, sill, head, frame, T * 0.7);
        }
        cur = c.s1;
      });
      piece(cur, len + T, 0, H, wallMat);
    }
  });

  // ---------- furniture ----------
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const builders = {};
  const add = (g, geo, material, x, y, z, noShadow) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = !noShadow; m.receiveShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, material, x, y, z, noShadow) => add(g, new THREE.BoxGeometry(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005)), material, x, y + h / 2, z, noShadow);
  const cyl = (g, r0, r1, h, material, x, y, z) => add(g, new THREE.CylinderGeometry(r0, r1, h, 24), material, x, y + h / 2, z);
  const legs = (g, w, d, h, material, inset, t) => { const s = t || 0.045; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((k) => box(g, s, h, s, material, k[0] * (w / 2 - inset - s / 2), 0, k[1] * (d / 2 - inset - s / 2))); };

  const seating = (g, it, seats) => {
    const w = it.w, d = it.d, h = it.h, body = mat(it.color, -0.1), cushion = mat(it.color, 0.18), dark = mat(P.dark, 0.25);
    const arm = Math.min(0.2, w * 0.12), backT = Math.min(0.24, d * 0.27), seatH = Math.min(0.42, h * 0.52), lg = 0.07;
    legs(g, w, d, lg, dark, 0.03);
    box(g, w, seatH - lg - 0.12, d, body, 0, lg, 0);
    box(g, w, h - lg, backT, body, 0, lg, -d / 2 + backT / 2);
    [-1, 1].forEach((k) => box(g, arm, seatH + 0.16 - lg, d - backT, body, k * (w / 2 - arm / 2), lg, backT / 2));
    const inner = w - 2 * arm, cw = inner / seats;
    for (let i = 0; i < seats; i++) {
      const x = -inner / 2 + cw * (i + 0.5);
      box(g, cw - 0.02, 0.13, d - backT - 0.03, cushion, x, seatH - 0.12, backT / 2);
      const bc = box(g, cw - 0.04, Math.max(0.2, h - seatH - 0.08), 0.13, cushion, x, seatH, -d / 2 + backT + 0.07); bc.rotation.x = -0.12;
    }
  };
  builders.sofa = (g, it) => seating(g, it, it.w > 1.7 ? 3 : it.w > 1.15 ? 2 : 1);
  builders.armchair = (g, it) => seating(g, it, 1);
  builders.bench = (g, it) => { const wood = mat(P.woodDark, -0.05); legs(g, it.w, it.d, it.h - 0.07, wood, 0.04); box(g, it.w, 0.07, it.d, mat(it.color, 0.1), 0, it.h - 0.07, 0); };
  builders.ottoman = (g, it) => { const m = mat(it.color, 0.05); if (Math.abs(it.w - it.d) < 0.08) cyl(g, it.w / 2, it.w / 2 * 0.94, it.h, m, 0, 0, 0); else box(g, it.w, it.h, it.d, m, 0, 0, 0); };

  const table = (g, it, opt) => {
    const top = mat(it.color, 0.08), leg = mat(it.color, -0.35), tt = 0.04, o = opt || {};
    if (o.round) { cyl(g, it.w / 2, it.w / 2, tt, top, 0, it.h - tt, 0); cyl(g, 0.025, 0.025, it.h - tt - 0.02, leg, 0, 0.02, 0); cyl(g, it.w * 0.3, it.w * 0.32, 0.02, leg, 0, 0, 0); return; }
    box(g, it.w, tt, it.d, top, 0, it.h - tt, 0);
    legs(g, it.w, it.d, it.h - tt, leg, 0.03, o.leg);
    if (o.shelf) box(g, it.w - 0.14, 0.02, it.d - 0.14, top, 0, it.h * 0.28, 0);
    if (o.drawers) box(g, Math.min(0.38, it.w * 0.32), it.h * 0.5, it.d - 0.08, mat(it.color, -0.08), it.w / 2 - Math.min(0.38, it.w * 0.32) / 2 - 0.05, it.h - tt - it.h * 0.5, 0);
  };
  builders.coffee_table = (g, it) => table(g, it, { shelf: true });
  builders.dining_table = (g, it) => table(g, it, { leg: 0.07 });
  builders.console_table = (g, it) => table(g, it, { shelf: true });
  builders.desk = (g, it) => table(g, it, { drawers: true });
  builders.side_table = (g, it) => table(g, it, { round: Math.abs(it.w - it.d) < 0.06 });

  const storage = (g, it, cols, rows) => {
    const body = mat(it.color, -0.02), front = mat(it.color, 0.16), knob = mat(P.dark, 0.2), pl = 0.05;
    box(g, it.w - 0.04, pl, it.d - 0.04, mat(it.color, -0.4), 0, 0, 0);
    box(g, it.w, it.h - pl, it.d, body, 0, pl, 0);
    const pw = (it.w - 0.03) / cols, ph = (it.h - pl - 0.03) / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const x = -it.w / 2 + 0.015 + pw * (c + 0.5), y = pl + 0.015 + ph * r;
      box(g, pw - 0.015, ph - 0.015, 0.012, front, x, y, it.d / 2 + 0.004, true);
      const tall = ph > pw * 1.3;
      add(g, new THREE.SphereGeometry(0.014, 10, 8), knob, tall ? x + (c % 2 ? -1 : 1) * (pw / 2 - 0.05) : x, tall ? y + ph * 0.5 : y + ph - 0.06, it.d / 2 + 0.022, true);
    }
  };
  builders.tv_stand = (g, it) => storage(g, it, Math.max(2, Math.round(it.w / 0.55)), 1);
  builders.cabinet = (g, it) => storage(g, it, Math.max(1, Math.round(it.w / 0.45)), it.h > 1.1 ? 2 : 1);
  builders.shoe_cabinet = (g, it) => storage(g, it, Math.max(1, Math.round(it.w / 0.6)), Math.max(2, Math.round(it.h / 0.4)));
  builders.dresser = (g, it) => storage(g, it, it.w > 1 ? 2 : 1, Math.max(2, Math.round(it.h / 0.25)));
  builders.nightstand = (g, it) => storage(g, it, 1, 2);
  builders.wardrobe = (g, it) => storage(g, it, Math.max(2, Math.round(it.w / 0.5)), 1);
  builders.bookshelf = (g, it) => {
    const wood = mat(it.color, 0), t = 0.03, n = Math.max(3, Math.round(it.h / 0.36));
    box(g, it.w, it.h, 0.015, mat(it.color, -0.2), 0, 0, -it.d / 2 + 0.008);
    [-1, 1].forEach((k) => box(g, t, it.h, it.d, wood, k * (it.w / 2 - t / 2), 0, 0));
    const tones = [P.accent, P.soft, P.lamp, P.glass, P.wood, P.dark];
    let seed = hash(it.uid);
    for (let i = 0; i <= n; i++) {
      const y = i === n ? it.h - t : (it.h - t) * (i / n);
      box(g, it.w - 2 * t, t, it.d, wood, 0, y, 0);
      if (i === n) break;
      const gap = (it.h - t) / n - t; let x = -it.w / 2 + t + 0.03;
      while (x < it.w / 2 - t - 0.3) {
        seed = (seed * 1103515245 + 12345) >>> 0; const bw = 0.025 + (seed % 5) * 0.008, bh = gap * (0.6 + ((seed >> 4) % 4) * 0.09);
        box(g, bw, bh, it.d * 0.7, mat(tones[(seed >> 8) % tones.length], 0.1), x + bw / 2, y + t, -0.01, true); x += bw + 0.004;
        if ((seed >> 12) % 9 === 0) x += 0.12;
      }
    }
  };
  const chair = (g, it, swivel) => {
    const seat = mat(it.color, 0.1), frame = mat(swivel ? P.dark : it.color, swivel ? 0.2 : -0.35), sh = Math.min(0.45, it.h * 0.5), w = it.w * 0.92, d = it.d * 0.92;
    box(g, w, 0.06, d, seat, 0, sh - 0.06, 0);
    const back = box(g, w, it.h - sh - 0.04, 0.045, seat, 0, sh + 0.04, -d / 2 + 0.03); back.rotation.x = -0.08;
    if (swivel) { cyl(g, 0.025, 0.025, sh - 0.09, frame, 0, 0.03, 0); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const s = box(g, 0.04, 0.03, w * 0.5, frame, Math.sin(a) * w * 0.25, 0, Math.cos(a) * w * 0.25); s.rotation.y = a; } }
    else legs(g, w, d, sh - 0.06, frame, 0.01, 0.035);
  };
  builders.dining_chair = (g, it) => chair(g, it, false);
  builders.study_chair = (g, it) => chair(g, it, true);
  builders.bed_frame = (g, it) => {
    const body = mat(it.color, -0.12), dark = mat(P.dark, 0.25);
    legs(g, it.w, it.d, 0.08, dark, 0.04, 0.06);
    box(g, it.w, 0.22, it.d, body, 0, 0.08, 0);
    box(g, it.w, Math.max(it.h, 0.6), 0.08, mat(it.color, 0), 0, 0, -it.d / 2 + 0.04);
  };
  builders.mattress = (g, it) => {
    const y = it.lift || 0, th = Math.max(0.16, it.h);
    box(g, it.w, th, it.d, mat(P.linen, 0.3), 0, y, 0);
    const n = it.w > 1.2 ? 2 : 1, pw = Math.min(0.62, it.w / n - 0.12);
    for (let i = 0; i < n; i++) box(g, pw, 0.1, 0.38, mat(P.linen, 0.6), (i - (n - 1) / 2) * (it.w / n), y + th, -it.d / 2 + 0.3);
    box(g, it.w + 0.02, 0.035, it.d * 0.58, mat(P.soft, -0.05), 0, y + th, it.d * 0.21);
  };
  builders.floor_lamp = (g, it) => {
    const r = Math.min(it.w, it.d) / 2, metal = mat(P.dark, 0.3, { metalness: 0.5, roughness: 0.45 });
    cyl(g, r * 0.75, r * 0.8, 0.03, metal, 0, 0, 0); cyl(g, 0.014, 0.014, it.h - 0.28, metal, 0, 0.03, 0);
    cyl(g, Math.max(0.09, r * 0.6), Math.max(0.14, r * 0.95), 0.28, new THREE.MeshStandardMaterial({ color: col(P.lamp, 0.55), emissive: col(P.lamp, 0.2), emissiveIntensity: 0.55, roughness: 0.9 }), 0, it.h - 0.28, 0);
  };
  builders.rug = (g, it) => { box(g, it.w, 0.012, it.d, mat(it.color, -0.12), 0, 0.001, 0, true); box(g, it.w - 0.24, 0.014, it.d - 0.24, mat(it.color, 0.2), 0, 0.001, 0, true); };
  builders.floor_mirror = (g, it) => {
    const lean = new THREE.Group(); lean.position.set(0, 0, -it.d / 2 + 0.02); lean.rotation.x = -0.1; g.add(lean);
    box(lean, it.w, it.h, 0.035, mat(P.woodDark, -0.1), 0, 0, 0.02);
    box(lean, it.w - 0.07, it.h - 0.07, 0.01, mat(P.glass, 0.72, { roughness: 0.15 }), 0, 0.035, 0.041, true);
  };
  builders.planter = (g, it) => {
    const r = Math.min(it.w, it.d) / 2, ph = Math.min(0.4, it.h * 0.35);
    cyl(g, r * 0.72, r * 0.55, ph, mat(P.woodDark, 0.1), 0, 0, 0);
    const leaf = mat(P.plant, -0.05); let seed = hash(it.uid);
    for (let i = 0; i < 5; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const a = (i / 5) * Math.PI * 2, rr = r * (0.55 + (seed % 5) * 0.06); add(g, new THREE.SphereGeometry(rr, 14, 10), leaf, Math.cos(a) * r * 0.35, ph + (it.h - ph) * (0.35 + (i % 3) * 0.22), Math.sin(a) * r * 0.35); }
  };
  builders.custom = (g, it) => box(g, it.w, it.h, it.d, mat(it.color, 0), 0, 0, 0);

  const items = DATA.items.map((src) => {
    const it = Object.assign({}, src, { w: src.w * M, d: src.d * M, h: src.h * M, x: src.x * M, z: src.z * M });
    if (it.category === "mattress") {
      const bed = DATA.items.find((o) => o.category === "bed_frame" && o.roomId === src.roomId && Math.abs(o.x - src.x) < 40 && Math.abs(o.z - src.z) < 40);
      it.lift = bed ? 0.3 : 0;
    }
    const g = new THREE.Group(); g.position.set(it.x, 0, it.z); g.rotation.y = it.rot; g.userData.uid = it.uid;
    (builders[it.category] || builders.custom)(g, it);
    scene.add(g);
    return { it, g, top: Math.max(it.h, 0.05) + (it.lift || 0) };
  });

  // ---------- labels ----------
  const layer = document.getElementById("labels");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const labels = [];
  if (home) DATA.rooms.forEach((r) => {
    let cx = 0, cz = 0; r.poly.forEach((p) => { cx += p.x * M; cz += p.y * M; }); cx /= r.poly.length; cz /= r.poly.length;
    const el = document.createElement("div"); el.className = "lb room"; el.textContent = r.label; layer.appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(cx, H + 0.1, cz) });
  });
  else items.forEach(({ it, top }) => {
    if (it.category === "mattress" && it.lift) return; // the bed's own label is enough
    const el = document.createElement("div"); el.className = "lb " + it.status; el.dataset.uid = it.uid;
    el.innerHTML = (it.image ? '<img src="' + esc(it.image) + '" alt="">' : "") + "<span>" + esc(short(it.title || it.label, 20)) + "</span>";
    el.addEventListener("click", () => select(it.uid, true));
    layer.appendChild(el);
    labels.push({ el, uid: it.uid, rank: it.status === "real" ? 1 : 2, pos: new THREE.Vector3(it.x, top + 0.12, it.z) });
  });
  let showLabels = INIT.labels !== false;

  // ---------- camera + controls ----------
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  const target = center.clone().setY(home ? 0 : 0.5);
  const view = { theta: Math.PI / 4, phi: 0.95, radius: 10 };
  let fit = 10;
  const refit = () => { const a = Math.max(0.3, canvas.clientWidth / Math.max(1, canvas.clientHeight)); fit = ((span * 0.5 + 0.35) / Math.tan((camera.fov * Math.PI) / 360)) / Math.min(1, a); };
  const setView = (name) => { refit(); target.copy(center).setY(home || name === "top" ? 0 : 0.5); if (name === "top") { view.theta = 0; view.phi = 0.02; view.radius = fit + H; } else { view.theta = Math.PI / 4; view.phi = home ? 0.75 : 0.95; view.radius = fit * 1.15; } dirty = true; };
  let dirty = true;
  const apply = () => {
    view.phi = Math.min(1.48, Math.max(0.02, view.phi)); view.radius = Math.min(fit * 2.2, Math.max(1.2, view.radius));
    const s = Math.sin(view.phi) * view.radius;
    camera.position.set(target.x + s * Math.sin(view.theta), target.y + Math.cos(view.phi) * view.radius, target.z + s * Math.cos(view.theta));
    camera.lookAt(target);
  };
  const resize = () => { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); refit(); dirty = true; };
  window.addEventListener("resize", resize);

  const pts = new Map(); let moved = 0, downAt = 0, pinch = 0, lastMid = null;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { moved = 0; downAt = Date.now(); } pinch = 0; lastMid = null; });
  canvas.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) { view.theta -= dx * 0.008; view.phi -= dy * 0.006; dirty = true; }
    else if (pts.size === 2) {
      const a = [...pts.values()], dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      if (pinch) view.radius *= pinch / Math.max(1, dist);
      if (lastMid) { const k = view.radius * 0.0012, mx = mid.x - lastMid.x, my = mid.y - lastMid.y; target.x -= (Math.cos(view.theta) * mx + Math.sin(view.theta) * my) * k; target.z -= (-Math.sin(view.theta) * mx + Math.cos(view.theta) * my) * k; }
      pinch = dist; lastMid = mid; dirty = true;
    }
  });
  const ray = new THREE.Raycaster();
  const up = (e) => {
    const had = pts.has(e.pointerId); pts.delete(e.pointerId); pinch = 0; lastMid = null;
    if (!had || pts.size || moved > 8 || Date.now() - downAt > 500) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(items.map((i) => i.g), true)[0];
    let o = hit ? hit.object : null; while (o && !o.userData.uid) o = o.parent;
    select(o ? o.userData.uid : null, true);
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); view.radius *= Math.exp(e.deltaY * 0.0012); dirty = true; }, { passive: false });

  // ---------- selection ----------
  let selected = null, outline = null;
  const select = (uid, tell) => {
    selected = uid || null;
    if (outline) { scene.remove(outline); outline.geometry.dispose(); outline = null; }
    const found = items.find((i) => i.it.uid === selected);
    if (found) { outline = new THREE.BoxHelper(found.g, col(P.accent, 0)); scene.add(outline); }
    labels.forEach((l) => l.el.classList.toggle("on", !!l.uid && l.uid === selected));
    dirty = true; if (tell) post({ type: "select", uid: selected });
  };

  // ---------- messages from the app ----------
  const handle = (m) => { if (!m || typeof m !== "object") return; if (m.type === "view") setView(m.view); if (m.type === "labels") { showLabels = !!m.on; dirty = true; } if (m.type === "select") select(m.uid, false); };
  window.__rf = handle;
  window.addEventListener("message", (e) => { let d = e.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (x) { return; } } handle(d); });

  // ---------- render ----------
  const v = new THREE.Vector3();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!dirty) return; dirty = false;
    apply();
    const dx = camera.position.x - target.x, dz = camera.position.z - target.z, dist = camera.position.distanceTo(target) || 1;
    if (!home) walls.forEach((w) => { w.visible = (w.userData.out[0] * dx + w.userData.out[1] * dz) / dist < 0.22; });
    renderer.render(scene, camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Place labels nearest-first; one that would cover another shrinks to a dot (still tappable).
    const placed = [];
    labels.forEach((l) => { v.copy(l.pos).project(camera); l.sx = ((v.x + 1) / 2) * w; l.sy = ((1 - v.y) / 2) * h; l.sz = v.z; l.ok = showLabels && v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05; });
    labels.slice().sort((p, q) => (p.uid === selected ? 0 : p.rank || 2) - (q.uid === selected ? 0 : q.rank || 2) || p.sz - q.sz).forEach((l) => {
      l.el.style.display = l.ok ? "flex" : "none";
      if (!l.ok) return;
      l.el.classList.remove("mini");
      const bw = l.el.offsetWidth, bh = l.el.offsetHeight;
      const r = { x0: l.sx - bw / 2 - 3, x1: l.sx + bw / 2 + 3, y0: l.sy - bh - 3, y1: l.sy + 3 };
      const clash = placed.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
      if (clash) l.el.classList.add("mini"); else placed.push(r);
      l.el.style.transform = "translate(-50%,-100%) translate(" + l.sx + "px," + l.sy + "px)";
    });
  };
  resize(); setView("default"); if (INIT.selected) select(INIT.selected, false);
  frame();
  document.getElementById("msg").style.display = "none";
  post({ type: "ready", items: items.length });
})();
`;

const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");

function viewerHtml(scene: Scene3D, p: ReturnType<typeof palette>, init: { labels: boolean; selected: string | null }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:${p.bg};overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#c{width:100%;height:100%;display:block;touch-action:none}
#labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lb{position:absolute;left:0;top:0;display:flex;align-items:center;gap:5px;font:600 11px -apple-system,system-ui,sans-serif;color:${p.text};background:${p.labelBg};padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.22);pointer-events:auto;cursor:pointer;border:1.5px solid transparent}
.lb img{width:22px;height:22px;border-radius:50%;object-fit:cover;margin:-1px 0 -1px -5px;background:${p.bg}}
.lb.unchosen{color:${p.muted};font-weight:500;opacity:.92}
.lb.on{border-color:${p.accent}}
.lb.mini{width:12px;height:12px;padding:0;gap:0;border-radius:50%;background:${p.accent};border:2px solid ${p.labelBg}}
.lb.mini span,.lb.mini img{display:none}
.lb.mini.unchosen{background:${p.muted}}
.lb.room{pointer-events:none;cursor:default}
#msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font:500 14px -apple-system,system-ui,sans-serif;color:${p.muted}}
</style></head><body><canvas id="c"></canvas><div id="labels"></div><div id="msg">Loading 3D view…</div>
<script>window.__SCENE__=${safeJson(scene)};window.__PALETTE__=${safeJson(p)};window.__INIT__=${safeJson(init)};</script>
<script type="module">${VIEWER_JS}</script>
</body></html>`;
}

export const Furnished3DView = forwardRef<Furnished3DHandle, Props>(function Furnished3DView({ scene, selectedUid = null, showLabels = true, onSelect, style, testID }, ref) {
  const { colors } = useTheme();
  const inject = useRef<((js: string) => void) | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const live = useRef({ labels: showLabels, selected: selectedUid, onSelect });
  useEffect(() => {
    live.current = { labels: showLabels, selected: selectedUid, onSelect };
  });

  // Rebuild the page only when the scene itself changes; labels / selection / view are sent as messages.
  const sceneKey = JSON.stringify(scene);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => viewerHtml(scene, palette(colors), { labels: live.current.labels, selected: live.current.selected }), [sceneKey, colors]);

  const send = useCallback((msg: object) => {
    if (Platform.OS === "web") frame.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    else inject.current?.(`window.__rf&&window.__rf(${JSON.stringify(msg)});true;`);
  }, []);
  const receive = useCallback(
    (raw: unknown) => {
      let m: { type?: string; uid?: string | null } | null = null;
      try {
        m = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof m);
      } catch {
        return;
      }
      if (!m) return;
      if (m.type === "select") live.current.onSelect?.(m.uid ?? null);
      if (m.type === "ready") {
        send({ type: "labels", on: live.current.labels });
        send({ type: "select", uid: live.current.selected });
      }
    },
    [send],
  );

  useImperativeHandle(ref, () => ({ setView: (view) => send({ type: "view", view }) }), [send]);
  useEffect(() => send({ type: "labels", on: showLabels }), [showLabels, send]);
  useEffect(() => send({ type: "select", uid: selectedUid }), [selectedUid, send]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const on = (e: MessageEvent) => {
      if (frame.current && e.source === frame.current.contentWindow) receive(e.data);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [receive]);

  if (Platform.OS === "web") {
    return (
      <View style={style} testID={testID}>
        {React.createElement("iframe", { ref: frame, srcDoc: html, title: "Furnished room in 3D", style: { border: 0, width: "100%", height: "100%" } })}
      </View>
    );
  }
  return (
    <View style={[style, { overflow: "hidden" }]} testID={testID}>
      <WebView
        ref={(r) => {
          inject.current = r ? (js) => r.injectJavaScript(js) : null;
        }}
        source={{ html, baseUrl: "https://roomfit.local/" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        scrollEnabled={false}
        onMessage={(e: WebViewMessageEvent) => receive(e.nativeEvent.data)}
        style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}
      />
    </View>
  );
});
