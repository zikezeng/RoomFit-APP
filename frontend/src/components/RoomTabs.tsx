import React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { usePlan } from "@/src/state/plan-store";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export function RoomTabs() {
  const { state, selectRoom } = usePlan();
  const { colors } = useTheme();
  if (state.selectedRoomIds.length < 2) return null;
  return <ScrollView horizontal accessibilityRole="tablist" contentContainerStyle={{ gap: spacing.sm }}>
    {state.selectedRoomIds.map((id) => {
      const room = state.apartment.rooms.find((r) => r.id === id);
      const active = id === state.selectedRoomId;
      return <Pressable key={id} testID={`room-tab-${id}`} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => selectRoom(id)} style={{ padding: spacing.md, borderRadius: radius.pill, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
        <Text style={{ fontFamily: fonts.text, color: active ? colors.brandPrimary : colors.onSurface }}>{room?.label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}
