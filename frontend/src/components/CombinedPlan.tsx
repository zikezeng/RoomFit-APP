import React from "react";
import { Pressable, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { PlanCanvas } from "./PlanCanvas";
import { catFill } from "./FloorPlan";
import { bbox, buildGeom, roomScale } from "@/src/lib/apartment";
import { getProduct } from "@/src/lib/catalog";
import { footprint } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { useTheme } from "@/src/theme";

export function CombinedPlan({ onPressItem }: { onPressItem: (uid: string) => void }) {
  const { state } = usePlan();
  const { colors } = useTheme();
  const ap = state.apartment;
  return <View testID="combined-floorplan" style={{ width: "100%" }}>
    <PlanCanvas ap={ap} selectedRoomIds={state.selectedRoomIds} />
    <Svg width="100%" height="100%" viewBox={`0 0 ${ap.imgW || 1} ${ap.imgH || 1}`} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      {state.selectedRoomIds.map(id => {
        const room = ap.rooms.find(r => r.id === id);
        const geom = buildGeom(ap, id);
        const scale = room && roomScale(ap, room);
        if (!room || !geom || !scale) return null;
        const bounds = bbox(room.poly);
        const plan = id === state.selectedRoomId ? state.plan : state.roomProgress[id]?.plan;
        return <G key={id}>{[...(plan ?? [])].sort((a,b) => Number(b.category === "rug") - Number(a.category === "rug")).map(item => {
          const p = getProduct(item.productId);
          const r = footprint(item, p, geom);
          const x = bounds.x0 + r.x / scale, y = bounds.y0 + r.y / scale;
          return <G key={item.uid}>
            <Rect x={x} y={y} width={r.w / scale} height={r.h / scale} fill={catFill(colors, item.category)} fillOpacity={item.category === "rug" ? 0.5 : 0.95} stroke={colors.onSurfaceTertiary} strokeWidth={ap.imgW / 800} />
            <SvgText x={x + r.w / scale / 2} y={y + r.h / scale / 2} textAnchor="middle" fontSize={ap.imgW / 100} fill={colors.onSurface}>{p.name.slice(0, 12)}</SvgText>
          </G>;
        })}</G>;
      })}
    </Svg>
    {(() => {
      const room = ap.rooms.find(r => r.id === state.selectedRoomId);
      const geom = buildGeom(ap, state.selectedRoomId);
      const scale = room && roomScale(ap, room);
      if (!room || !geom || !scale) return null;
      const bounds = bbox(room.poly);
      return (state.plan ?? []).map(item => {
        const product = getProduct(item.productId);
        const rect = footprint(item, product, geom);
        return <Pressable key={item.uid} accessibilityLabel={product.name} testID={`combined-item-${item.uid}`} onPress={() => onPressItem(item.uid)} style={{ position: "absolute", left: `${(bounds.x0 + rect.x / scale) / ap.imgW * 100}%`, top: `${(bounds.y0 + rect.y / scale) / ap.imgH * 100}%`, width: `${rect.w / scale / ap.imgW * 100}%`, height: `${rect.h / scale / ap.imgH * 100}%` }} />;
      });
    })()}
  </View>;
}
