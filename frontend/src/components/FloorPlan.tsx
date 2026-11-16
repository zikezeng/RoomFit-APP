import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { RoomGeom } from "@/src/lib/apartment";
import { getProduct } from "@/src/lib/catalog";
import { fmtLen } from "@/src/lib/geometry";
import { footprint } from "@/src/lib/solver";
import { CategoryId, PlacedItem } from "@/src/lib/types";
import { ThemeColors, fonts, useTheme } from "@/src/theme";

export const catFill = (c: ThemeColors, cat: CategoryId) => {
  if (["sofa", "armchair", "ottoman", "bed_frame", "bench"].includes(cat)) return c.brandSecondary;
  if (["tv_stand", "bookshelf", "wardrobe", "cabinet", "shoe_cabinet", "dresser"].includes(cat)) return c.woodDark;
  if (cat === "floor_lamp") return c.warning;
  if (cat === "rug" || cat === "planter") return c.brandTertiary;
  if (cat === "mattress") return c.surfaceSecondary;
  if (cat === "custom") return c.info;
  return c.wood;
};

// Match the furniture icons used in Step 4 without changing that screen.
const ICONS: Partial<Record<CategoryId, string>> = {
  sofa: "🛋️", coffee_table: "☕", tv_stand: "📺", armchair: "🪑",
  floor_lamp: "💡", dining_table: "🍽️", dining_chair: "🪑", shoe_cabinet: "👟",
  cabinet: "🗄️", bed_frame: "🛏️", mattress: "🛏️", nightstand: "🗄️",
  wardrobe: "👕", desk: "💻", study_chair: "🪑", dresser: "🗄️",
  side_table: "☕", bookshelf: "📚", rug: "🧶", console_table: "🗄️",
  ottoman: "🛋️", bench: "🪑", floor_mirror: "🪞", planter: "🪴",
  custom: "📦",
};

function DragHandle({ rect, vw, vh, margin, pxWidth, onTap, onDrag, onDrop, onCancel, testID, label }: {
  rect: { x: number; y: number; w: number; h: number };
  vw: number; vh: number; margin: number; pxWidth: number;
  onTap: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDrop: (dx: number, dy: number) => void;
  onCancel: () => void;
  testID: string; label: string;
}) {
  // Keep responder identity stable while visual positions update on each gesture frame.
  const handlers = useRef({ onTap, onDrag, onDrop, onCancel, pxWidth, vw });
  handlers.current = { onTap, onDrag, onDrop, onCancel, pxWidth, vw };
  const convert = (dx: number, dy: number) => {
    const scale = handlers.current.pxWidth > 0 ? handlers.current.vw / handlers.current.pxWidth : 0;
    return { x: dx * scale, y: dy * scale };
  };
  const convertRef = useRef(convert);
  convertRef.current = convert;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => {
      const d = convertRef.current(gesture.dx, gesture.dy);
      handlers.current.onDrag(d.x, d.y);
    },
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < 6) handlers.current.onTap();
      else {
        const d = convertRef.current(gesture.dx, gesture.dy);
        handlers.current.onDrop(d.x, d.y);
      }
    },
    onPanResponderTerminate: () => handlers.current.onCancel(),
  }), []);
  return <View
    {...responder.panHandlers}
    testID={testID}
    accessibilityLabel={`Drag ${label} to move it`}
    style={{ position: "absolute", left: `${((rect.x + margin) / vw) * 100}%`,
      top: `${((rect.y + margin) / vh) * 100}%`,
      width: `${(Math.max(rect.w, 34) / vw) * 100}%`,
      height: `${(Math.max(rect.h, 34) / vh) * 100}%` }}
  />;
}

const SHORT: Partial<Record<CategoryId, string>> = {
  sofa: "Sofa", coffee_table: "Coffee tbl", tv_stand: "TV", armchair: "Chair", side_table: "Side", floor_lamp: "Lamp", bookshelf: "Shelf", desk: "Desk", rug: "Rug",
  dining_table: "Dining", dining_chair: "Ch", shoe_cabinet: "Shoes", cabinet: "Cabinet", study_chair: "Ch", bed_frame: "Bed", mattress: "", nightstand: "NS",
  wardrobe: "Wardrobe", dresser: "Dresser", ottoman: "Pouf", console_table: "Console", floor_mirror: "", planter: "Plant", bench: "Bench",
};

interface Props {
  geom: RoomGeom;
  items?: PlacedItem[];
  selectedUid?: string | null;
  onPressItem?: (uid: string) => void;
  onMoveItem?: (uid: string, cx: number, cy: number) => void;
  editable?: boolean;
  showDims?: boolean;
  testID?: string;
}

/** Scaled top-down plan of ONE room (real polygon geometry, cm). */
export function FloorPlan({ geom: g, items = [], selectedUid, onPressItem, onMoveItem, editable = false, showDims = true, testID }: Props) {
  const { colors } = useTheme();
  const [pixelWidth, setPixelWidth] = useState(0);
  const [preview, setPreview] = useState<{ uid: string; cx: number; cy: number } | null>(null);
  const W = g.width;
  const L = g.length;
  const M = Math.max(W, L) * 0.1;
  const fs = Math.max(W, L) / 34;
  const wallW = Math.max(W, L) / 60;
  const rendered = preview ? items.map(it => it.uid === preview.uid ? { ...it, cx: preview.cx, cy: preview.cy, wall: null } : it) : items;
  const ordered = [...rendered].sort((a, b) => Number(["rug", "mattress"].includes(a.category) ? 0 : 1) - Number(["rug", "mattress"].includes(b.category) ? 0 : 1)).sort((a, b) => Number(b.category === "rug") - Number(a.category === "rug"));
  const pts = g.poly.map((p) => `${p.x},${p.y}`).join(" ");
  const VW = W + 2 * M;
  const VH = L + 2 * M;
  const originalByUid = new Map(items.map(it => [it.uid, it]));
  return (
    <View testID={testID} onLayout={e => setPixelWidth(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: VW / VH }}>
      <Svg width="100%" height="100%" viewBox={`${-M} ${-M} ${VW} ${VH}`}>
        <Polygon points={pts} fill={colors.surfaceSecondary} stroke={colors.onSurface} strokeWidth={wallW} strokeLinejoin="miter" />
        {g.obstacles.map((o, i) => (
          <G key={`ob${i}`}>
            <Rect x={o.rect.x} y={o.rect.y} width={o.rect.w} height={o.rect.h} fill={colors.surfaceTertiary} stroke={colors.borderStrong} strokeWidth={wallW / 4} strokeDasharray={`${fs / 3} ${fs / 4}`} />
            <SvgText x={o.rect.x + o.rect.w / 2} y={o.rect.y + o.rect.h / 2} fontSize={fs * 0.55} fontFamily={fonts.text} fill={colors.muted} textAnchor="middle">
              Fixed
            </SvgText>
          </G>
        ))}
        {g.windows.map((w, i) => (
          <Line key={`w${i}`} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={colors.info} strokeWidth={wallW * 1.1} />
        ))}
        {g.doors.map((d, i) => {
          const w = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
          const p1 = { x: d.a.x + d.n.x * w, y: d.a.y + d.n.y * w };
          const t1 = Math.atan2(p1.y - d.a.y, p1.x - d.a.x);
          const t2 = Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x);
          let delta = t2 - t1;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          return (
            <G key={`d${i}`}>
              <Line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} stroke={colors.surfaceSecondary} strokeWidth={wallW * 1.3} />
              <Path d={`M ${d.a.x} ${d.a.y} L ${p1.x} ${p1.y} A ${w} ${w} 0 0 ${delta > 0 ? 1 : 0} ${d.b.x} ${d.b.y}`} stroke={colors.muted} strokeWidth={wallW / 4} strokeDasharray={`${fs / 2} ${fs / 3}`} fill="none" />
            </G>
          );
        })}
        {ordered.map((it) => {
          const p = getProduct(it.productId);
          if (!p) return null;
          const r = footprint(it, p, g);
          const sel = it.uid === selectedUid;
          const soft = it.category === "rug" || it.category === "mattress";
          const small = Math.min(r.w, r.h) < 50;
          const name = it.category === "custom" ? p.name.slice(0, 10) : SHORT[it.category] ?? "";
          const icon = ICONS[it.category] ?? "📦";
          return (
            <G key={it.uid}>
              {it.category === "floor_lamp" || it.category === "planter" ? (
                <Circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={r.w / 2} fill={catFill(colors, it.category)} stroke={sel ? colors.brandPrimary : colors.onSurfaceTertiary} strokeWidth={sel ? wallW * 0.8 : wallW / 4} />
              ) : (
                <Rect x={r.x} y={r.y} width={r.w} height={r.h} rx={soft ? 2 : Math.min(r.w, r.h) / 8} fill={catFill(colors, it.category)} opacity={it.category === "rug" ? 0.7 : 1} stroke={sel ? colors.brandPrimary : colors.onSurfaceTertiary} strokeWidth={sel ? wallW * 0.8 : wallW / 4} strokeDasharray={soft && !sel ? `${fs / 2} ${fs / 3}` : undefined} />
              )}
              {editable ? (
                <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + fs * 0.26} fontSize={Math.min(fs * 1.5, Math.min(r.w, r.h) * 0.7)} fill={colors.onSurface} textAnchor="middle">{icon}</SvgText>
              ) : !soft && name ? (
                <>
                  <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 - (small ? 0 : fs * 0.15)} fontSize={small ? fs * 0.55 : fs * 0.8} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurface} textAnchor="middle">
                    {name}
                  </SvgText>
                  {showDims && !small ? (
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + fs * 0.8} fontSize={fs * 0.62} fontFamily={fonts.text} fill={colors.onSurfaceTertiary} textAnchor="middle">
                      {`${p.width}×${p.depth}`}
                    </SvgText>
                  ) : null}
                </>
              ) : null}
            </G>
          );
        })}
        {showDims ? (
          <>
            <SvgText x={W / 2} y={-M / 2.4} fontSize={fs} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurfaceTertiary} textAnchor="middle">
              {fmtLen(W, g.unit)}
            </SvgText>
            <SvgText x={-M / 2.2} y={L / 2} fontSize={fs} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurfaceTertiary} textAnchor="middle" transform={`rotate(-90 ${-M / 2.2} ${L / 2})`}>
              {fmtLen(L, g.unit)}
            </SvgText>
          </>
        ) : null}
      </Svg>
      {onPressItem
        ? ordered.map((it) => {
            const p = getProduct(it.productId);
            if (!p) return null;
            const r = footprint(it, p, g);
            const original = originalByUid.get(it.uid) ?? it;
            return editable && onMoveItem ? (
              <DragHandle key={`hit-${it.uid}`}
                rect={footprint(original, p, g)} vw={VW} vh={VH} margin={M} pxWidth={pixelWidth}
                testID={`${testID ?? "plan"}-item-${it.uid}`} label={p.name}
                onTap={() => { setPreview(null); onPressItem?.(it.uid); }}
                onDrag={(dx, dy) => {
                  setPreview({ uid: it.uid, cx: original.cx + dx, cy: original.cy + dy });
                }}
                onDrop={(dx, dy) => {
                  setPreview(null);
                  onMoveItem(it.uid, original.cx + dx, original.cy + dy);
                }}
                onCancel={() => setPreview(null)}
              />
            ) : (
              <Pressable
                key={`hit-${it.uid}`}
                testID={`${testID ?? "plan"}-item-${it.uid}`}
                accessibilityLabel={p.name}
                onPress={() => onPressItem?.(it.uid)}
                style={{ position: "absolute", left: `${((r.x + M) / VW) * 100}%`, top: `${((r.y + M) / VH) * 100}%`, width: `${(r.w / VW) * 100}%`, height: `${(r.h / VH) * 100}%` }}
              />
            );
          })
        : null}
    </View>
  );
}
