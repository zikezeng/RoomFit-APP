import { Image } from "expo-image";
import React, { useState } from "react";
import { GestureResponderEvent, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { centroid, roomStats } from "@/src/lib/apartment";
import { fmtAreaCm2 } from "@/src/lib/geometry";
import { Apartment, Pt, RoomKind } from "@/src/lib/types";
import { ThemeColors, fonts, radius, useTheme } from "@/src/theme";

export const roomColor = (c: ThemeColors, k: RoomKind) =>
  ({ living: c.roomLiving, dining: c.roomLiving, bedroom: c.roomBedroom, kitchen: c.roomKitchen, bathroom: c.roomBathroom, closet: c.roomCloset, balcony: c.roomBalcony, hallway: c.roomOther, other: c.roomOther })[k];

interface Props {
  ap: Apartment;
  selectedRoomId?: string | null;
  edge?: { roomId: string; i: number } | null;
  vertex?: { roomId: string; i: number } | null;
  openingId?: string | null;
  draft?: Pt[];
  dimRooms?: (id: string) => boolean;
  onTap?: (p: Pt, tol: number) => void;
  testID?: string;
}

/** The user's actual floor plan image with an editable room-segmentation overlay (image px space). */
export function PlanCanvas({ ap, selectedRoomId, edge, vertex, openingId, draft = [], dimRooms, onTap, testID }: Props) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const W = ap.imgW || 1;
  const H = ap.imgH || 1;
  const k = w / W; // display px per image px
  const fs = W / 40;
  const sw = W / 300;
  const tap = (e: GestureResponderEvent) => {
    if (!onTap || !k) return;
    onTap({ x: e.nativeEvent.locationX / k, y: e.nativeEvent.locationY / k }, 22 / k);
  };
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: W / H, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary }}>
      {ap.imageUri ? <Image source={{ uri: ap.imageUri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" /> : null}
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", pointerEvents: "none" }}>
        {ap.rooms.map((r) => {
          const sel = r.id === selectedRoomId;
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
                ? r.poly.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={sw * (vertex?.roomId === r.id && vertex.i === i ? 5 : 3)} fill={vertex?.roomId === r.id && vertex.i === i ? colors.error : colors.brandPrimary} />)
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
      </Svg>
      {onTap ? <View testID={`${testID ?? "plan-canvas"}-touch`} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onStartShouldSetResponder={() => true} onResponderRelease={tap} /> : null}
    </View>
  );
}
