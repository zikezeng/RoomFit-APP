import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { roomColor } from "@/src/components/PlanCanvas";
import { Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL } from "@/src/lib/apartment";
import { FURNISHABLE } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { RoomKind } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const KINDS: RoomKind[] = ["living", "bedroom", "kitchen", "bathroom", "closet", "balcony"];

export default function RoomsStep() {
  const router = useRouter();
  const { state, selectKind } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const sel = state.roomKind;
  const supported = !!sel && FURNISHABLE.includes(sel);
  const u = state.apartment.unit;

  return (
    <WizardScaffold
      step={3}
      title="Which Room Would You Like to Furnish?"
      subtitle={state.dimsConfirmed ? `Your confirmed room: ${fmtLen(state.room.width, u)} × ${fmtLen(state.room.length, u)} · ${fmtAreaCm2(state.room.width * state.room.length, u)}` : "Confirm your room dimensions first."}
      cta={{ label: sel ? `Furnish ${KIND_LABEL[sel]}` : "Select a room", disabled: !supported || !state.dimsConfirmed, onPress: () => router.push("/plan/furniture"), testID: "rooms-continue-button" }}
    >
      {!state.dimsConfirmed ? <Notice tone="warning" text="Go back and confirm the room dimensions in Step 2." testID="rooms-no-dims" /> : null}
      {sel && !supported ? <Notice tone="warning" text={`Automatic furnishing for the ${KIND_LABEL[sel].toLowerCase()} is not supported yet. Living rooms and bedrooms are fully supported.`} testID="room-unsupported-notice" /> : null}
      {KINDS.map((k) => {
        const ok = FURNISHABLE.includes(k);
        const on = k === sel;
        return (
          <Pressable key={k} testID={`select-room-${k}`} onPress={() => selectKind(k)} style={[s.row, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
            <View style={[s.dot, { backgroundColor: roomColor(colors, k) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{KIND_LABEL[k]}</Text>
              <Text style={[s.p, { color: ok ? colors.success : colors.muted, fontWeight: "600" }]}>{ok ? "Auto-furnishing supported" : "Not supported yet"}</Text>
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
