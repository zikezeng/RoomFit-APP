import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/ui";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const { state, reset } = usePlan();
  const inProgress = !!state.apartment.source;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={s.heroImg} contentFit="cover" transition={300} />
          <LinearGradient colors={["transparent", colors.scrim, colors.surfaceInverse]} style={s.heroScrim} />
          <View style={[s.nav, { top: insets.top + spacing.sm }]}>
            <View style={s.logo}>
              <Feather name="home" size={16} color={colors.onBrandPrimary} />
            </View>
            <Text style={s.logoText} testID="app-logo">
              RoomFit
            </Text>
          </View>
          <Animated.View entering={FadeInDown.duration(500)} style={s.heroText}>
            <Text style={s.tag}>Your Space. Your Style. Your Budget. Perfectly Fitted.</Text>
            <Text style={s.h1} testID="home-headline">
              Design a Home That Actually Fits.
            </Text>
            <Text style={s.sub}>Upload your floor plan, discover your style, and find furniture that fits your space and budget — all in one place.</Text>
          </Animated.View>
        </View>
        <View style={s.body}>
          <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ gap: spacing.md }}>
            <Button
              label="Start Designing"
              icon="arrow-right"
              testID="start-designing-button"
              onPress={() => {
                if (!inProgress) reset();
                router.push("/plan/upload");
              }}
            />
            {inProgress ? (
              <Button kind="ghost" small label="Start a fresh project" icon="refresh-cw" testID="home-reset-button" onPress={() => (reset(), router.push("/plan/upload"))} />
            ) : null}
          </Animated.View>

          <Text style={s.foot}>Room outlines are suggested by a vision AI model and always confirmed by you. Layouts are computed by a deterministic constraint solver.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 520, justifyContent: "flex-end" },
  heroImg: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const) },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 360 },
  nav: { position: "absolute", left: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { fontFamily: fonts.display, fontSize: 22, color: c.onSurfaceInverse, fontWeight: "600" },
  heroText: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  tag: { fontFamily: fonts.text, fontSize: 12, color: c.brandSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 44, color: c.onSurfaceInverse, letterSpacing: -0.8 },
  sub: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceInverse, opacity: 0.88 },
  body: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" },
  h2: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface, marginTop: spacing.lg },
  benefit: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  benefitIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  benefitTitle: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: 2 },
  benefitText: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20, color: c.onSurfaceTertiary, flex: 1 },
  howRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  howDivider: { borderTopWidth: 1, borderTopColor: c.divider },
  howNum: { width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, backgroundColor: c.brandPrimary, color: c.onBrandPrimary, fontFamily: fonts.text, fontWeight: "700", overflow: "hidden" },
  foot: { fontFamily: fonts.text, fontSize: 12, lineHeight: 18, color: c.muted },
}));
