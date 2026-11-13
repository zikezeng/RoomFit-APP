import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";

import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, buildGeom, pointInPoly, roomStats } from "@/src/lib/apartment";
import { FURNISHABLE } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { roomRank, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RoomsStep() {
  const router = useRouter();
<<<<<<< Updated upstream
  const { state, geom, toggleRoom } = usePlan();
=======
  const { state, selectRoom, startRooms } = usePlan();
>>>>>>> Stashed changes
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const rooms = [...ap.rooms].sort((a, b) => roomRank(a.kind) - roomRank(b.kind));
  const canContinue = state.selectedRoomIds.length > 0 && state.selectedRoomIds.every(id => !!buildGeom(ap, id));

  return (
    <WizardScaffold
      step={3}
      title="Which Rooms Would You Like to Furnish?"
<<<<<<< Updated upstream
      subtitle="Tap rooms on your plan or select their cards. Each room type gets its own furniture list, and every piece stays inside that room's real walls."
      cta={{ label: state.selectedRoomIds.length ? `Furnish ${state.selectedRoomIds.length} room${state.selectedRoomIds.length === 1 ? "" : "s"}` : "Select a room", disabled: !state.selectedRoomIds.length || !geom, onPress: () => router.push("/plan/furniture"), testID: "rooms-continue-button" }}
=======
      subtitle="Select rooms on your plan or below. Furnish each selected room one at a time."
      cta={{ label: `Furnish ${state.selectedRoomIds.length} rooms`, disabled: !canContinue, onPress: () => { startRooms(); router.push("/plan/furniture"); }, testID: "rooms-continue-button" }}
>>>>>>> Stashed changes
    >
      <PlanCanvas
        ap={ap}
        selectedRoomIds={state.selectedRoomIds}
        dimRooms={(id) => !FURNISHABLE.includes(ap.rooms.find((r) => r.id === id)!.kind)}
        onTap={(p) => {
          const hit = ap.rooms.find((r) => pointInPoly(p, r.poly));
          if (hit) toggleRoom(hit.id);
        }}
        testID="rooms-canvas"
      />
      {rooms.map((r) => {
        const st = roomStats(ap, r);
        const ok = FURNISHABLE.includes(r.kind);
        const on = state.selectedRoomIds.includes(r.id);
        return (
<<<<<<< Updated upstream
          <Pressable key={r.id} testID={`select-room-${r.kind}-${r.id}`} disabled={!ok} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !ok }} onPress={() => toggleRoom(r.id)} style={[s.row, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
=======
          <Pressable key={r.id} disabled={!ok} accessibilityState={{ disabled: !ok, selected: on }} testID={`select-room-${r.kind}-${r.id}`} onPress={() => selectRoom(r.id)} style={[s.row, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
>>>>>>> Stashed changes
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
