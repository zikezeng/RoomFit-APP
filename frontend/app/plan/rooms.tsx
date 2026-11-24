import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";
import { Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, buildGeom, pointInPoly, roomStats } from "@/src/lib/apartment";
import { FURNISHABLE } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { roomRank, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RoomsStep() {
  const router = useRouter();
  const { state, selectRoom, startRooms, setRoomBudgets, setBudgetPlan } = usePlan();
  const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({});
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const rooms = [...ap.rooms].sort((a, b) => roomRank(a.kind) - roomRank(b.kind));
  const selectedCount = state.selectedRoomIds.length;
  const canContinueRooms = selectedCount > 0 && state.selectedRoomIds.every(id => !!buildGeom(ap, id));
  const selectedRooms = rooms.filter(room => state.selectedRoomIds.includes(room.id));
  // A room budget is entered by the user. The total is only the sum shown below,
  // never a separate input or an automatic allocation.
  const roomAmount = (id: string) => {
    const saved = state.roomBudgetOverrides?.[id]
      ?? state.roomProgress[id]?.budget
      ?? (id === state.selectedRoomId ? state.budget : 0);
    return Number(roomDrafts[id] ?? saved);
  };
  const roomsComplete = selectedRooms.every(room => {
    const text = roomDrafts[room.id];
    return text !== "" && Number.isFinite(roomAmount(room.id)) && roomAmount(room.id) > 0;
  });
  const allocated = selectedRooms.reduce((sum, room) => sum + (Number.isFinite(roomAmount(room.id)) ? roomAmount(room.id) : 0), 0);
  const overLimit = allocated > 150000;
  const canContinue = canContinueRooms && roomsComplete && !overLimit;

  const saveRoomBudget = (id: string) => {
    const draft = roomDrafts[id];
    if (draft == null || !draft.length || !Number.isFinite(Number(draft)) || Number(draft) < 0 || overLimit) return;
    setRoomBudgets({ [id]: Number(draft) });
    setRoomDrafts(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };
  const saveAllRoomBudgets = () => {
    const changes: Record<string, number> = {};
    for (const room of selectedRooms) {
      if (roomDrafts[room.id] != null) changes[room.id] = Number(roomDrafts[room.id]);
    }
    setBudgetPlan(allocated, changes);
    setRoomDrafts({});
  };

  return (
    <WizardScaffold
      step={3}
      title="Which Rooms Would You Like to Furnish?"
      subtitle="Choose all the rooms you want to furnish. Tap the floor plan or the list to select multiple rooms."
      keyboardAware
      cta={{ label: selectedCount ? `Furnish ${selectedCount} ${selectedCount === 1 ? "room" : "rooms"}` : "Select rooms", disabled: !canContinue, onPress: () => { saveAllRoomBudgets(); startRooms(); router.push("/plan/furniture"); }, testID: "rooms-continue-button" }}
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
      <Card style={s.budgetCard} testID="rooms-total-budget-card">
        <Text style={s.budgetTitle}>Budget by room</Text>
        <Text style={s.budgetHint}>Enter a budget for each room. Your total is calculated automatically.</Text>
        {selectedRooms.map(room => (
          <View key={room.id} style={s.roomBudgetRow}>
            <Text style={s.roomBudgetName}>{room.label}</Text>
            <View style={s.roomInputBox}>
              <Text style={s.roomDollar}>$</Text>
              <TextInput
                testID={`room-budget-${room.id}`}
                accessibilityLabel={`${room.label} budget in dollars`}
                style={s.roomBudgetInput}
                keyboardType="number-pad"
                selectTextOnFocus
                value={roomDrafts[room.id] ?? String(state.roomBudgetOverrides?.[room.id]
                  ?? state.roomProgress[room.id]?.budget
                  ?? (room.id === state.selectedRoomId ? state.budget : 0))}
                onChangeText={text => setRoomDrafts(previous => ({
                  ...previous, [room.id]: text.replace(/[^0-9]/g, ""),
                }))}
                onBlur={() => saveRoomBudget(room.id)}
                onSubmitEditing={() => saveRoomBudget(room.id)}
              />
            </View>
          </View>
        ))}
        <View style={s.totalRow} testID="rooms-budget-auto-total">
          <Text style={s.totalLabel}>Total apartment budget</Text>
          <Text style={s.totalValue}>{money(allocated)}</Text>
        </View>
        {!roomsComplete && selectedCount > 0
          ? <Notice tone="error" text="Enter a budget greater than $0 for each selected room." />
          : null}
        {overLimit
          ? <Notice tone="error" text="The combined apartment budget cannot exceed $150,000." testID="rooms-budget-over-limit" />
          : null}
      </Card>
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  budgetCard: { gap: spacing.md },
  roomBudgetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  roomBudgetName: { flex: 1, fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  roomInputBox: { flexDirection: "row", alignItems: "center", borderColor: c.border, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, backgroundColor: c.surfaceSecondary },
  roomDollar: { fontFamily: fonts.text, fontSize: 17, color: c.muted },
  roomBudgetInput: { width: 90, textAlign: "right", fontFamily: fonts.text, fontSize: 17, fontWeight: "700", color: c.onSurface, minHeight: 40, paddingVertical: 4 },
  budgetTitle: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  budgetHint: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  totalRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  totalLabel: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  totalValue: { fontFamily: fonts.text, fontSize: 22, fontWeight: "700", color: c.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  dot: { width: 18, height: 18, borderRadius: 9 },
  name: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
}));
