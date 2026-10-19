import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";
import { Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, pointInPoly, roomStats } from "@/src/lib/apartment";
import { FURNISHABLE } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RoomsStep() {
  const router = useRouter();
  const { state, geom, selectRoom } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const sel = ap.rooms.find((r) => r.id === state.selectedRoomId);
  const supported = !!sel && FURNISHABLE.includes(sel.kind);
  // Furnishable rooms first (living, then bedrooms), then the rest.
  const rank = (k: string) => (k === "living" ? 0 : k === "bedroom" ? 1 : FURNISHABLE.includes(k as never) ? 2 : 3);
  const rooms = [...ap.rooms].sort((a, b) => rank(a.kind) - rank(b.kind));

  return (
    <WizardScaffold
      step={3}
      title="Which Room Would You Like to Furnish?"
      subtitle="Tap a room on your plan. Each room type gets its own furniture list, and every piece stays inside that room's real walls."
      cta={{ label: sel ? `Furnish ${sel.label}` : "Select a room", disabled: !supported || !geom, onPress: () => router.push("/plan/furniture"), testID: "rooms-continue-button" }}
    >
      <PlanCanvas
        ap={ap}
        selectedRoomId={state.selectedRoomId}
        dimRooms={(id) => !FURNISHABLE.includes(ap.rooms.find((r) => r.id === id)!.kind)}
        onTap={(p) => {
          const hit = ap.rooms.find((r) => pointInPoly(p, r.poly));
          if (hit) selectRoom(hit.id);
        }}
        testID="rooms-canvas"
      />
      {sel && !supported ? <Notice tone="warning" text={`${sel.label} is identified, but bathrooms and unlabelled areas are not furnished automatically. Choose another room, or set its type in Step 2.`} testID="room-unsupported-notice" /> : null}
      {rooms.map((r) => {
        const st = roomStats(ap, r);
        const ok = FURNISHABLE.includes(r.kind);
        const on = r.id === state.selectedRoomId;
        return (
          <Pressable key={r.id} testID={`select-room-${r.kind}-${r.id}`} onPress={() => selectRoom(r.id)} style={[s.row, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
            <View style={[s.dot, { backgroundColor: roomColor(colors, r.kind) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{r.label}</Text>
              <Text style={s.p}>{st ? `${fmtLen(st.w, ap.unit)} × ${fmtLen(st.l, ap.unit)} · ${fmtAreaCm2(st.area, ap.unit)}` : "Uncalibrated"}</Text>
              <Text style={[s.p, { color: ok ? colors.success : colors.muted, fontWeight: "600" }]}>{ok ? "Auto-furnishing supported" : `${KIND_LABEL[r.kind]} · furnishing not supported yet`}</Text>
            </View>
            {on ? <Feather name="check-circle" size={22} color={colors.brandPrimary} /> : null}
          </Pressable>
        );
      })}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  dot: { width: 18, height: 18, borderRadius: 9 },
  name: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
}));
