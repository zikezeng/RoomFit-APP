import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";
import { Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, buildGeom, pointInPoly, roomStats } from "@/src/lib/apartment";
import { FURNISHABLE } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { rebalanceRoomBudgets, roomRank, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RoomsStep() {
  const router = useRouter();
  const { state, selectRoom, startRooms, setApartmentBudget, setRoomBudgets } = usePlan();
  const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({});
  const [budgetDraft, setBudgetDraft] = useState(String(state.apartmentBudget));
  const [editingBudget, setEditingBudget] = useState(false);
  const budgetNumber = Number(budgetDraft);
  const validBudget = budgetDraft.length > 0 && Number.isFinite(budgetNumber) && budgetNumber >= 300 && budgetNumber <= 150000;
  useEffect(() => {
    if (!editingBudget) setBudgetDraft(String(state.apartmentBudget));
  }, [state.apartmentBudget, editingBudget]);
  const commitBudget = () => {
    setEditingBudget(false);
    if (validBudget && Math.round(budgetNumber) !== state.apartmentBudget) setApartmentBudget(Math.round(budgetNumber));
  };
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const rooms = [...ap.rooms].sort((a, b) => roomRank(a.kind) - roomRank(b.kind));
  const selectedCount = state.selectedRoomIds.length;
  const canContinueRooms = selectedCount > 0 && state.selectedRoomIds.every(id => !!buildGeom(ap, id));
  // Preview the same room-level allocation that will be saved when continuing.
  // This also updates immediately when rooms are selected or the total is edited.
  const split = rebalanceRoomBudgets({
    ...state,
    apartmentBudget: validBudget ? Math.round(budgetNumber) : state.apartmentBudget,
  });
  const selectedRooms = rooms.filter(room => state.selectedRoomIds.includes(room.id));
  const roomAmount = (id: string) => {
    const draft = roomDrafts[id];
    return draft == null ? split.roomProgress[id]?.budget ?? 0 : Number(draft);
  };
  const roomsComplete = selectedRooms.every(room => {
    const draft = roomDrafts[room.id];
    return draft == null || (draft.length > 0 && Number.isFinite(Number(draft)));
  });
  const allocated = selectedRooms.reduce((sum, room) => sum + roomAmount(room.id), 0);
  const overAllocated = validBudget && allocated > budgetNumber;
  const canContinue = canContinueRooms && validBudget && roomsComplete && !overAllocated;
  const saveRoomBudget = (id: string) => {
    const draft = roomDrafts[id];
    if (draft == null) return;
    if (!draft.length || !Number.isFinite(Number(draft)) || allocated > budgetNumber || !validBudget) return;
    setRoomBudgets({ [id]: Math.round(Number(draft)) });
    setRoomDrafts(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };
  const saveAllRoomBudgets = () => {
    const changes: Record<string, number> = {};
    for (const room of selectedRooms) {
      const draft = roomDrafts[room.id];
      if (draft != null) changes[room.id] = Math.round(Number(draft));
    }
    if (Object.keys(changes).length) setRoomBudgets(changes);
    setRoomDrafts({});
  };

  return (
    <WizardScaffold
      step={3}
      title="Which Rooms Would You Like to Furnish?"
      subtitle="Choose all the rooms you want to furnish. Tap the floor plan or the list to select multiple rooms."
      keyboardAware
      cta={{ label: selectedCount ? `Furnish ${selectedCount} ${selectedCount === 1 ? "room" : "rooms"}` : "Select rooms", disabled: !canContinue, onPress: () => { commitBudget(); saveAllRoomBudgets(); startRooms(); router.push("/plan/furniture"); }, testID: "rooms-continue-button" }}
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
        <Text style={s.budgetTitle}>Total apartment budget</Text>
        <Text style={s.budgetHint}>One shared budget for all {selectedCount || "selected"} rooms.</Text>
        <View style={s.budgetInputRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            testID="rooms-budget-input"
            accessibilityLabel="Total budget for all selected rooms in dollars"
            style={s.budgetInput}
            keyboardType="number-pad"
            selectTextOnFocus
            placeholder="e.g. 5000"
            value={budgetDraft}
            onFocus={() => setEditingBudget(true)}
            onChangeText={t => setBudgetDraft(t.replace(/[^0-9]/g, ""))}
            onBlur={commitBudget}
            onSubmitEditing={commitBudget}
          />
        </View>
        {!validBudget ? (
          <Notice tone="error" text={`Enter a total budget between ${money(300)} and ${money(150000)}.`} testID="rooms-budget-error" />
        ) : null}
        {selectedCount > 0 ? (
          <View style={s.roomBudgetList} testID="rooms-budget-by-room">
            <Text style={s.roomBudgetHeading}>Budget by room</Text>
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
                    value={roomDrafts[room.id] ?? String(split.roomProgress[room.id]?.budget ?? 0)}
                    onChangeText={text => setRoomDrafts(previous => ({ ...previous, [room.id]: text.replace(/[^0-9]/g, "") }))}
                    onBlur={() => saveRoomBudget(room.id)}
                    onSubmitEditing={() => saveRoomBudget(room.id)}
                  />
                </View>
              </View>
            ))}
            <View style={s.roomBudgetRow}>
              <Text style={s.budgetHint}>Total assigned</Text>
              <Text style={s.roomBudgetAmount}>{money(allocated)}</Text>
            </View>
            <View style={s.roomBudgetRow}>
              <Text style={s.budgetHint}>Unallocated budget</Text>
              <Text style={s.roomBudgetAmount}>{money(validBudget ? budgetNumber - allocated : 0)}</Text>
            </View>
            {!roomsComplete ? <Notice tone="error" text="Enter a valid amount for every selected room." /> : null}
            {overAllocated ? (
              <Notice tone="error" text="Room budgets cannot add up to more than the total apartment budget. Reduce a room amount or increase the total." testID="rooms-budget-over-limit" />
            ) : null}
            <Text style={s.budgetHint}>Edit each room budget. Unallocated funds can remain available.</Text>
          </View>
        ) : null}
      </Card>
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  budgetCard: { gap: spacing.md },
  roomBudgetList: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md },
  roomBudgetHeading: { fontFamily: fonts.text, fontWeight: "700", fontSize: 15, color: c.onSurface },
  roomBudgetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  roomBudgetName: { flex: 1, fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  roomBudgetAmount: { fontFamily: fonts.text, fontWeight: "700", fontSize: 16, color: c.brandPrimary },
  roomInputBox: { flexDirection: "row", alignItems: "center", borderColor: c.border, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, backgroundColor: c.surfaceSecondary },
  roomDollar: { fontFamily: fonts.text, fontSize: 17, color: c.muted },
  roomBudgetInput: { width: 90, textAlign: "right", fontFamily: fonts.text, fontSize: 17, fontWeight: "700", color: c.onSurface, minHeight: 40, paddingVertical: 4 },
  budgetTitle: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  budgetHint: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  budgetInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: c.surfaceSecondary },
  dollar: { fontFamily: fonts.display, fontSize: 34, color: c.muted },
  budgetInput: { flex: 1, fontFamily: fonts.display, fontSize: 34, color: c.onSurface, paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  dot: { width: 18, height: 18, borderRadius: 9 },
  name: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
}));
