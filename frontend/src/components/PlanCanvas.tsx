import { Image } from "expo-image";
import React, { useRef, useState } from "react";
import { GestureResponderEvent, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { bbox, buildGeom, centroid, roomStats, scaleOf } from "@/src/lib/apartment";
import { getProduct } from "@/src/lib/catalog";
import { footprint } from "@/src/lib/solver";
import { catFill } from "@/src/components/FloorPlan";
import { fmtAreaCm2 } from "@/src/lib/geometry";
import { Apartment, PlacedItem, Pt, RoomKind } from "@/src/lib/types";
import { ThemeColors, fonts, radius, useTheme } from "@/src/theme";

export const roomColor = (c: ThemeColors, k: RoomKind) =>
  ({ living: c.roomLiving, dining: c.roomLiving, bedroom: c.roomBedroom, kitchen: c.roomKitchen, bathroom: c.roomBathroom, closet: c.roomCloset, balcony: c.roomBalcony, hallway: c.roomOther, other: c.roomOther })[k];

interface Props {
  ap: Apartment;
<<<<<<< Updated upstream
  items?: PlacedItem[];
  selectedUid?: string | null;
  onPressItem?: (uid: string) => void;
=======
>>>>>>> Stashed changes
  selectedRoomIds?: string[];
  selectedRoomId?: string | null;
  edge?: { roomId: string; i: number } | null;
  vertex?: { roomId: string; i: number } | null;
  openingId?: string | null;
  draft?: Pt[];
  dimRooms?: (id: string) => boolean;
  onTap?: (p: Pt, tol: number) => void;
  /** Return true to start dragging from this point (e.g. a corner handle). */
  onDragStart?: (p: Pt, tol: number) => boolean;
  onDrag?: (p: Pt) => void;
  onDragEnd?: () => void;
  testID?: string;
}

/** The user's actual floor plan image with an editable room-segmentation overlay (image px space). */
<<<<<<< Updated upstream
export function PlanCanvas({ ap, items = [], selectedUid, onPressItem, selectedRoomId, selectedRoomIds, edge, vertex, openingId, draft = [], dimRooms, onTap, onDragStart, onDrag, onDragEnd, testID }: Props) {
=======
export function PlanCanvas({ ap, selectedRoomId, selectedRoomIds, edge, vertex, openingId, draft = [], dimRooms, onTap, onDragStart, onDrag, onDragEnd, testID }: Props) {
>>>>>>> Stashed changes
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const dragging = useRef(false);
  const W = ap.imgW || 1;
  const H = ap.imgH || 1;
  const k = w / W; // display px per image px
  const fs = W / 40;
  const sw = W / 300;
  const handle = k ? Math.max(sw * 3, 9 / k) : sw * 3; // ≥ 9 display px so corners are easy to grab
  const pt = (e: GestureResponderEvent): Pt => ({ x: Math.max(0, Math.min(W, e.nativeEvent.locationX / k)), y: Math.max(0, Math.min(H, e.nativeEvent.locationY / k)) });
  const grant = (e: GestureResponderEvent) => {
    dragging.current = !!k && !!onDragStart?.(pt(e), 22 / k);
  };
  const move = (e: GestureResponderEvent) => {
    if (dragging.current) onDrag?.(pt(e));
  };
  const release = (e: GestureResponderEvent) => {
    if (dragging.current) {
      dragging.current = false;
      return onDragEnd?.();
    }
    if (onTap && k) onTap(pt(e), 22 / k);
  };
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: W / H, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary }}>
      {ap.imageUri ? <Image source={{ uri: ap.imageUri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" /> : null}
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", pointerEvents: onPressItem ? "auto" : "none" }}>
        {ap.rooms.map((r) => {
<<<<<<< Updated upstream
          const sel = selectedRoomIds?.includes(r.id) ?? r.id === selectedRoomId;
=======
          const sel = r.id === selectedRoomId || !!selectedRoomIds?.includes(r.id);
>>>>>>> Stashed changes
          const c = centroid(r.poly);
          const st = roomStats(ap, r);
          const faded = dimRooms?.(r.id);
          return (
            <G key={r.id} opacity={faded ? 0.45 : 1}>
              <Polygon points={r.poly.map((p) => `${p.x},${p.y}`).join(" ")} fill={roomColor(colors, r.kind)} fillOpacity={sel ? 0.55 : 0.32} stroke={sel ? colors.brandPrimary : roomColor(colors, r.kind)} strokeWidth={sel ? sw * 2.5 : sw} />
              <SvgText x={c.x} y={c.y} fontSize={fs} fontFamily={fonts.text} fontWeight="700" fill={colors.onSurface} textAnchor="middle">
                {r.label}
              </SvgText>
              <SvgText x={c.x} y={c.y + fs * 1.1} fontSize={fs * 0.75} fontFamily={fonts.text} fill={colors.onSurfaceTertiary} textAnchor="middle">
                {st ? fmtAreaCm2(st.area, ap.unit) : "Uncalibrated"}
              </SvgText>
              {sel
                ? r.poly.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={handle * (vertex?.roomId === r.id && vertex.i === i ? 1.5 : 1)} fill={vertex?.roomId === r.id && vertex.i === i ? colors.error : colors.brandPrimary} stroke={colors.surface} strokeWidth={sw} />)
                : null}
            </G>
          );
        })}
        {edge
          ? (() => {
              const r = ap.rooms.find((x) => x.id === edge.roomId);
              if (!r) return null;
              const a = r.poly[edge.i];
              const b = r.poly[(edge.i + 1) % r.poly.length];
              return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.error} strokeWidth={sw * 4} />;
            })()
          : null}
        {ap.calib ? <Line x1={ap.calib.a.x} y1={ap.calib.a.y} x2={ap.calib.b.x} y2={ap.calib.b.y} stroke={colors.success} strokeWidth={sw * 2} strokeDasharray={`${sw * 4} ${sw * 3}`} /> : null}
        {ap.fixtures.map((f) => (
          <Rect key={f.id} x={Math.min(f.a.x, f.b.x)} y={Math.min(f.a.y, f.b.y)} width={Math.abs(f.b.x - f.a.x)} height={Math.abs(f.b.y - f.a.y)} fill={colors.onSurfaceTertiary} fillOpacity={0.18} stroke={openingId === f.id ? colors.error : colors.onSurfaceTertiary} strokeWidth={sw} strokeDasharray={`${sw * 3} ${sw * 2}`} />
        ))}
        {ap.openings.map((o) => (
          <Line key={o.id} x1={o.a.x} y1={o.a.y} x2={o.b.x} y2={o.b.y} stroke={openingId === o.id ? colors.error : o.type === "door" ? colors.warning : colors.info} strokeWidth={sw * 3.5} strokeLinecap="round" />
        ))}
        {draft.length ? <Polyline points={draft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={colors.error} strokeWidth={sw * 2} /> : null}
        {draft.map((p, i) => (
          <Circle key={`dp${i}`} cx={p.x} cy={p.y} r={sw * 3} fill={colors.error} />
        ))}
        {[...items].sort((a, b) => Number(b.category === "rug") - Number(a.category === "rug")).map((item) => {
          const room = ap.rooms.find((r) => r.id === (item.roomId ?? selectedRoomId));
          const g = room && buildGeom(ap, room.id);
          const scale = scaleOf(ap);
          if (!room || !g || !scale) return null;
          const b = bbox(room.poly);
          const product = getProduct(item.productId);
          const rect = footprint(item, product, g);
          const x = b.x0 + rect.x / scale, y = b.y0 + rect.y / scale;
          return <G key={item.uid} onPress={() => onPressItem?.(item.uid)} testID={`${testID}-item-${item.uid}`}>
            <Rect x={x} y={y} width={rect.w / scale} height={rect.h / scale} rx={2} fill={catFill(colors, item.category)} opacity={item.category === "rug" ? 0.6 : 1} stroke={item.uid === selectedUid ? colors.brandPrimary : colors.onSurface} strokeWidth={item.uid === selectedUid ? sw * 2 : sw / 2} />
            <SvgText x={x + rect.w / scale / 2} y={y + rect.h / scale / 2} fontSize={fs * 0.5} textAnchor="middle" fill={colors.onSurface}>{product.name.split(" ").slice(0, 2).join(" ")}</SvgText>
          </G>;
        })}
      </Svg>
      {onTap ? <View testID={`${testID ?? "plan-canvas"}-touch`} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => !dragging.current} onResponderGrant={grant} onResponderMove={move} onResponderRelease={release} onResponderTerminate={() => dragging.current && ((dragging.current = false), onDragEnd?.())} /> : null}
    </View>
  );
}
