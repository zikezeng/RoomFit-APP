import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button, Chip, Notice, tap } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { STYLE_ENGINE } from "@/src/lib/ai";
import { MOODS, STYLES } from "@/src/lib/catalog";
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
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const addInspiration = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!r.canceled) update({ inspirations: [...state.inspirations, r.assets[0].uri] });
  };

  return (
    <WizardScaffold
      step={5}
      title="Find Your Style"
      subtitle="Pick one or more styles. We'll rank furniture that fits to match your taste."
      cta={{ label: "Continue", disabled: state.styles.length === 0, onPress: () => router.push("/plan/budget"), testID: "style-continue-button" }}
    >
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
      <Text style={s.h}>Mood (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {MOODS.map((m) => (
          <Chip key={m.id} label={m.label} selected={state.moods.includes(m.id)} onPress={() => update({ moods: toggle(state.moods, m.id) }, "layouts")} testID={`mood-chip-${m.id}`} />
        ))}
      </ScrollView>
      <Text style={s.h}>Upload an Inspiration Photo (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {state.inspirations.map((u, i) => (
          <View key={u + i}>
            <Image source={{ uri: u }} style={s.thumb} contentFit="cover" />
            <Pressable testID={`remove-inspiration-${i}`} style={s.remove} onPress={() => update({ inspirations: state.inspirations.filter((_, j) => j !== i) })}>
              <Feather name="x" size={14} color={colors.onSurfaceInverse} />
            </Pressable>
          </View>
        ))}
        <Pressable testID="add-inspiration-button" onPress={addInspiration} style={[s.thumb, s.add]}>
          <Feather name="image" size={22} color={colors.muted} />
          <Text style={s.addText}>Add photo</Text>
        </Pressable>
      </ScrollView>
      <Notice text={`${STYLE_ENGINE.note} Inspiration photos are saved for reference only.`} testID="style-engine-notice" />
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
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  thumb: { width: 96, height: 96, borderRadius: radius.md, flexShrink: 0 },
  add: { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: c.surfaceSecondary },
  addText: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  remove: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
}));
