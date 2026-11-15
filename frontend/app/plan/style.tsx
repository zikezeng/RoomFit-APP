import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button, Card, Chip, Notice, tap } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { STYLE_ENGINE } from "@/src/lib/ai";
import { STYLES, categoriesFor } from "@/src/lib/catalog";
import { StyleId } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const IMG: Record<StyleId, string> = {
  japandi: "https://images.unsplash.com/photo-1772797583328-f83bc3f94f80?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  modern: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?fm=jpg&q=80&w=900",
  minimalist: "https://images.unsplash.com/photo-1513694203232-719a280e022f?fm=jpg&q=80&w=900",
  traditional: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?fm=jpg&q=80&w=900",
  farmhouse: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?fm=jpg&q=80&w=900",
  bohemian: "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?fm=jpg&q=80&w=900",
  scandinavian: "https://images.unsplash.com/photo-1693382464372-fad822e7b38c?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  midcentury: "https://images.unsplash.com/photo-1724582586495-d050726cf354?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
  industrial: "https://images.unsplash.com/photo-1505873242700-f289a29e1e0f?crop=entropy&cs=srgb&fm=jpg&q=80&w=900",
};

export default function StyleStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [previewRoomId, setPreviewRoomId] = useState<string | null>(null);
  const selectedRooms = state.selectedRoomIds.flatMap((id) => {
    const room = state.apartment.rooms.find((r) => r.id === id);
    return room ? [room] : [];
  });
  const previewRoom = selectedRooms.find((r) => r.id === (previewRoomId ?? state.selectedRoomId)) ?? selectedRooms[0];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <WizardScaffold
      step={5}
      title="Find Your Style"
      subtitle="Pick one or more styles. We'll rank furniture that fits to match your taste."
      cta={{ label: "Continue", disabled: state.styles.length === 0, onPress: () => router.push("/plan/budget"), testID: "style-continue-button" }}
    >
      {selectedRooms.length > 1 && previewRoom ? (
        <Card style={{ gap: spacing.sm }} testID="style-room-preview">
          <Text style={s.h}>Furniture by room</Text>
          <View style={s.roomChips}>
            {selectedRooms.map((room) => (
              <Chip key={room.id} label={room.label} selected={previewRoom.id === room.id} onPress={() => setPreviewRoomId(room.id)} testID={`style-preview-room-${room.id}`} />
            ))}
          </View>
          <Text style={s.roomCategories} testID="style-room-categories">
            {categoriesFor(previewRoom.kind).map((category) => category.label).join(" · ")}
          </Text>
        </Card>
      ) : null}
      {STYLES.map((st) => {
        const on = state.styles.includes(st.id);
        return (
          <Pressable key={st.id} testID={`style-card-${st.id}`} onPress={() => (tap(), update({ styles: toggle(state.styles, st.id) }, "layouts"))} style={[s.card, on && s.cardOn]}>
            <Image source={{ uri: IMG[st.id] }} style={s.img} contentFit="cover" transition={250} />
            <LinearGradient colors={["transparent", colors.scrim]} style={s.scrim} />
            <View style={s.cardText}>
              <Text style={s.cardTitle}>{st.label}</Text>
              <Text style={s.cardSub}>{st.blurb}</Text>
            </View>
            <View style={[s.badge, on && s.badgeOn]}>{on ? <Feather name="check" size={16} color={colors.onBrandPrimary} /> : null}</View>
          </Pressable>
        );
      })}
      <Notice text={STYLE_ENGINE.note} testID="style-engine-notice" />
      {state.styles.length === 0 ? <Button kind="ghost" small label="Pick at least one style to continue" onPress={() => {}} testID="style-hint" disabled /> : null}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  card: { height: 190, borderRadius: radius.lg, overflow: "hidden", borderWidth: 3, borderColor: "transparent" },
  cardOn: { borderColor: c.brandPrimary },
  img: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 110 },
  cardText: { position: "absolute", left: spacing.lg, bottom: spacing.lg, right: 60 },
  cardTitle: { fontFamily: fonts.display, fontSize: 24, color: c.onSurfaceInverse },
  cardSub: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceInverse, opacity: 0.9 },
  badge: { position: "absolute", top: spacing.md, right: spacing.md, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: c.onSurfaceInverse, alignItems: "center", justifyContent: "center" },
  badgeOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  roomChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roomCategories: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurface },
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
}));
