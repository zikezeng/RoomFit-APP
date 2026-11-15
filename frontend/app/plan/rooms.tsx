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
  const { state, selectRoom, startRooms } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const rooms = [...ap.rooms].sort((a, b) => roomRank(a.kind) - roomRank(b.kind));
  const selectedCount = state.selectedRoomIds.length;
  const canContinue = selectedCount > 0 && state.selectedRoomIds.every(id => !!buildGeom(ap, id));

  return (
    <WizardScaffold
      step={3}
      title="Which Rooms Would You Like to Furnish?"
      subtitle="Choose all the rooms you want to furnish. Tap the floor plan or the list to select multiple rooms."
      cta={{ label: selectedCount ? `Furnish ${selectedCount} ${selectedCount === 1 ? "room" : "rooms"}` : "Select rooms", disabled: !canContinue, onPress: () => { startRooms(); router.push("/plan/furniture"); }, testID: "rooms-continue-button" }}
    >
      <PlanCanvas
        ap={ap}
        selectedRoomIds={state.selectedRoomIds}
        dimRooms={(id) => !FURNISHABLE.includes(ap.rooms.find((r) => r.id === id)!.kind)}
        onTap={(p) => {
          const hit = ap.rooms.find((r) => pointInPoly(p, r.poly));
          if (hit) selectRoom(hit.id);
        }}
        testID="rooms-canvas"
      />
      {rooms.map((r) => {
        const st = roomStats(ap, r);
        const ok = FURNISHABLE.includes(r.kind);
        const on = state.selectedRoomIds.includes(r.id);
        return (
          <Pressable key={r.id} disabled={!ok} accessibilityRole="checkbox" accessibilityState={{ disabled: !ok, checked: on }} testID={`select-room-${r.kind}-${r.id}`} onPress={() => selectRoom(r.id)} style={[s.row, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
            <View style={[s.dot, { backgroundColor: roomColor(colors, r.kind) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{r.label}</Text>
              <Text style={s.p}>{st ? `${fmtLen(st.w, ap.unit)} × ${fmtLen(st.l, ap.unit)} · ${fmtAreaCm2(st.area, ap.unit)}` : "Uncalibrated"}</Text>
              <Text style={[s.p, { color: ok ? colors.success : colors.muted, fontWeight: "600" }]}>{ok ? "Auto-furnishing supported" : `${KIND_LABEL[r.kind]} · furnishing not supported yet`}</Text>
            </View>
            {ok ? <Feather name={on ? "check-square" : "square"} size={22} color={on ? colors.brandPrimary : colors.muted} /> : null}
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
