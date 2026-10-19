import React from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { PRODUCT_MAP } from "@/src/lib/catalog";
import { doorZone, fmtLen, openingRect, wallLength } from "@/src/lib/geometry";
import { footprint } from "@/src/lib/solver";
import { CategoryId, PlacedItem, Room } from "@/src/lib/types";
import { ThemeColors, fonts, useTheme } from "@/src/theme";

export const catFill = (c: ThemeColors, cat: CategoryId) =>
  ({
    sofa: c.brandSecondary,
    armchair: c.brandSecondary,
    coffee_table: c.wood,
    side_table: c.wood,
    tv_stand: c.woodDark,
    bookshelf: c.woodDark,
    desk: c.wood,
    floor_lamp: c.warning,
    rug: c.brandTertiary,
  })[cat];

const SHORT: Record<CategoryId, string> = {
  sofa: "Sofa",
  coffee_table: "Coffee tbl",
  tv_stand: "TV",
  armchair: "Chair",
  side_table: "Side",
  floor_lamp: "Lamp",
  bookshelf: "Shelf",
  desk: "Desk",
  rug: "Rug",
};

interface Props {
  room: Room;
  items?: PlacedItem[];
  selectedUid?: string | null;
  onPressItem?: (uid: string) => void;
  showDims?: boolean;
  highlightWall?: string | null;
  testID?: string;
}

export function FloorPlan({ room, items = [], selectedUid, onPressItem, showDims = true, highlightWall, testID }: Props) {
  const { colors } = useTheme();
  const W = room.width;
  const L = room.length;
  const M = Math.max(W, L) * 0.1;
  const fs = Math.max(W, L) / 34;
  const wallW = Math.max(W, L) / 60;
  const d = room.door;
  const dz = doorZone(room);
  const dt = d.at * wallLength(room, d.wall);
  // door swing arc (hinged at the opening start)
  const arc = (() => {
    const r = d.width;
    const s = dt - r / 2;
    switch (d.wall) {
      case "bottom":
        return `M ${s} ${L} L ${s} ${L - r} A ${r} ${r} 0 0 1 ${s + r} ${L}`;
      case "top":
        return `M ${s} 0 L ${s} ${r} A ${r} ${r} 0 0 0 ${s + r} 0`;
      case "left":
        return `M 0 ${s} L ${r} ${s} A ${r} ${r} 0 0 1 0 ${s + r}`;
      default:
        return `M ${W} ${s} L ${W - r} ${s} A ${r} ${r} 0 0 0 ${W} ${s + r}`;
    }
  })();
  const ordered = [...items].sort((a, b) => Number(b.category === "rug") - Number(a.category === "rug"));
  const hw = (w: string) => (highlightWall === w ? colors.brandPrimary : colors.onSurface);
  return (
    <View testID={testID} style={{ width: "100%", aspectRatio: (W + 2 * M) / (L + 2 * M) }}>
      <Svg width="100%" height="100%" viewBox={`${-M} ${-M} ${W + 2 * M} ${L + 2 * M}`}>
        <Rect x={0} y={0} width={W} height={L} fill={colors.surfaceSecondary} />
        {/* walls */}
        <Line x1={0} y1={0} x2={W} y2={0} stroke={hw("top")} strokeWidth={wallW} />
        <Line x1={0} y1={L} x2={W} y2={L} stroke={hw("bottom")} strokeWidth={wallW} />
        <Line x1={0} y1={0} x2={0} y2={L} stroke={hw("left")} strokeWidth={wallW} />
        <Line x1={W} y1={0} x2={W} y2={L} stroke={hw("right")} strokeWidth={wallW} />
        {/* windows */}
        {room.windows.map((w, i) => {
          const r = openingRect(room, w, wallW * 1.2);
          const horiz = w.wall === "top" || w.wall === "bottom";
          const x = horiz ? r.x : w.wall === "left" ? -wallW / 2 : W - wallW / 2;
          const y = horiz ? (w.wall === "top" ? -wallW / 2 : L - wallW / 2) : r.y;
          return <Rect key={i} x={x} y={y} width={horiz ? r.w : wallW} height={horiz ? wallW : r.h} fill={colors.info} opacity={0.55} />;
        })}
        {/* door */}
        {(() => {
          const horiz = d.wall === "top" || d.wall === "bottom";
          const x = horiz ? dz.x : d.wall === "left" ? -wallW : W - wallW;
          const y = horiz ? (d.wall === "top" ? -wallW : L - wallW) : dz.y;
          return <Rect x={x} y={y} width={horiz ? d.width : wallW * 2} height={horiz ? wallW * 2 : d.width} fill={colors.surfaceSecondary} />;
        })()}
        <Path d={arc} stroke={colors.muted} strokeWidth={wallW / 4} strokeDasharray={`${fs / 2} ${fs / 3}`} fill="none" />
        {/* furniture */}
        {ordered.map((it) => {
          const p = PRODUCT_MAP[it.productId];
          if (!p) return null;
          const r = footprint(it, p, room);
          const sel = it.uid === selectedUid;
          const rug = it.category === "rug";
          const small = Math.min(r.w, r.h) < 50;
          return (
            <G key={it.uid}>
              {it.category === "floor_lamp" ? (
                <Circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={r.w / 2} fill={catFill(colors, it.category)} stroke={sel ? colors.brandPrimary : colors.onSurfaceTertiary} strokeWidth={sel ? wallW * 0.8 : wallW / 4} />
              ) : (
                <Rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={rug ? 2 : Math.min(r.w, r.h) / 8}
                  fill={catFill(colors, it.category)}
                  opacity={rug ? 0.7 : 1}
                  stroke={sel ? colors.brandPrimary : colors.onSurfaceTertiary}
                  strokeWidth={sel ? wallW * 0.8 : wallW / 4}
                  strokeDasharray={rug && !sel ? `${fs / 2} ${fs / 3}` : undefined}
                />
              )}
              {!rug || ordered.length < 3 ? (
                <>
                  <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 - (small ? 0 : fs * 0.15)} fontSize={small ? fs * 0.6 : fs * 0.8} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurface} textAnchor="middle">
                    {SHORT[it.category]}
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
        {/* dimensions */}
        {showDims ? (
          <>
            <SvgText x={W / 2} y={-M / 2.4} fontSize={fs} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurfaceTertiary} textAnchor="middle">
              {fmtLen(W, room.unit)}
            </SvgText>
            <SvgText x={-M / 2.2} y={L / 2} fontSize={fs} fontFamily={fonts.text} fontWeight="600" fill={colors.onSurfaceTertiary} textAnchor="middle" transform={`rotate(-90 ${-M / 2.2} ${L / 2})`}>
              {fmtLen(L, room.unit)}
            </SvgText>
          </>
        ) : null}
      </Svg>
      {onPressItem
        ? ordered.map((it) => {
            const p = PRODUCT_MAP[it.productId];
            if (!p) return null;
            const r = footprint(it, p, room);
            const VW = W + 2 * M;
            const VH = L + 2 * M;
            return (
              <Pressable
                key={`hit-${it.uid}`}
                testID={`${testID ?? "plan"}-item-${it.uid}`}
                accessibilityLabel={`${p.name}`}
                onPress={() => onPressItem(it.uid)}
                style={{ position: "absolute", left: `${((r.x + M) / VW) * 100}%`, top: `${((r.y + M) / VH) * 100}%`, width: `${(r.w / VW) * 100}%`, height: `${(r.h / VH) * 100}%` }}
              />
            );
          })
        : null}
    </View>
  );
}
