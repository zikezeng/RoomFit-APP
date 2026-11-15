import Feather from "@react-native-vector-icons/feather";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/ui";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const STEPS = ["Upload", "Dimensions", "Room", "Furniture", "Style", "Budget", "Layouts", "Shop", "Plan"];

interface Props {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  cta?: { label: string; onPress: () => void; disabled?: boolean; testID: string; icon?: React.ComponentProps<typeof Feather>["name"] };
  secondary?: { label: string; onPress: () => void; testID: string };
  header?: React.ReactNode; // sticky content under the title
  scrollEnabled?: boolean;
  keyboardAware?: boolean;
}

export function WizardScaffold({ step, title, subtitle, children, cta, secondary, header, scrollEnabled = true, keyboardAware = false }: Props) {
  const { state, previousRoom } = usePlan();
  const currentRoom = state.apartment.rooms.find(r => r.id === state.selectedRoomId);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const s = useStyles();
  const { colors } = useTheme();
  const useKeyboardScroll = keyboardAware && Platform.OS !== "web";
  const ContentScroll = useKeyboardScroll ? KeyboardAwareScrollView : ScrollView;
  const keyboardProps = useKeyboardScroll ? { bottomOffset: (cta ? 96 : spacing.md) + insets.bottom } : {};
  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.topRow}>
          <Pressable testID="wizard-back-button" onPress={() => {
            if (step === 4 && state.selectedRoomIds.indexOf(state.selectedRoomId ?? "") > 0) {
              previousRoom();
              router.navigate("/plan/results");
            } else if (step >= 4 && step <= 9) {
              const previous = ["/plan/rooms", "/plan/furniture", "/plan/style", "/plan/budget", "/plan/layouts", "/plan/shop"] as const;
              router.navigate(previous[step - 4]);
            } else if (router.canGoBack()) router.back();
            else router.replace("/");
          }} style={s.iconBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text testID="wizard-step-indicator" style={s.stepText}>
            Step {step} of {STEPS.length} · {STEPS[step - 1]}
          </Text>
          <Pressable testID="wizard-home-button" onPress={() => router.replace("/")} style={s.iconBtn} hitSlop={8}>
            <Feather name="home" size={18} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={s.progress} testID="wizard-progress">
          {STEPS.map((_, i) => (
            <View key={i} style={[s.seg, i < step && s.segOn]} />
          ))}
        </View>
        {step >= 4 && step <= 9 && currentRoom ? <Text style={s.stepText} testID="room-progress-label">Room {state.selectedRoomIds.indexOf(currentRoom.id) + 1} of {state.selectedRoomIds.length} — {currentRoom.label}</Text> : null}
        {header}
      </View>
      <ContentScroll {...keyboardProps} scrollEnabled={scrollEnabled} contentContainerStyle={[s.content, { paddingBottom: (cta ? 120 : spacing.xl) + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={s.title} testID="wizard-title">
            {title}
          </Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ gap: spacing.lg }}>
          {children}
        </Animated.View>
      </ContentScroll>
      {cta ? (
        <BlurView intensity={40} tint="light" style={[s.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
          {secondary ? <Button kind="secondary" label={secondary.label} onPress={secondary.onPress} testID={secondary.testID} style={{ flex: 1 }} /> : null}
          <Button label={cta.label} onPress={cta.onPress} disabled={cta.disabled} testID={cta.testID} icon={cta.icon ?? "arrow-right"} style={{ flex: secondary ? 1.4 : 1 }} />
        </BlurView>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: fonts.text, fontSize: 13, color: c.muted, fontWeight: "500" },
  progress: { flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.surfaceTertiary },
  segOn: { backgroundColor: c.brandPrimary },
  content: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: c.onSurface, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.muted, marginTop: spacing.sm },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: "row", gap: spacing.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface + "D9" },
}));
