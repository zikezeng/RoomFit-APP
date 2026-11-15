import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { ConfiguredPlan } from "@/src/components/ConfiguredPlan";
import { Button, Card, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { getProduct } from "@/src/lib/catalog";
import { validateLayout } from "@/src/lib/solver";
import { Facing, PlacedItem } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

const NEXT: Record<Facing, Facing> = { up: "right", right: "down", down: "left", left: "up" };

export default function LayoutsStep() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, geom, generate, selectLayout, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (pathname !== "/plan/layouts" || state.layouts || !geom) return;
    const timer = setTimeout(() => { generate(state.seed); setBusy(false); }, 450);
    return () => clearTimeout(timer);
  }, [pathname, state.layouts, geom, state.seed, generate]);

  // Show just one best valid option instead of three competing layout cards.
  const chosen = useMemo(() => state.layouts?.find(l => l.valid) ?? state.layouts?.[0],
    [state.layouts]);

  useEffect(() => {
    if (pathname !== "/plan/layouts" || !chosen?.valid || !state.layouts) return;
    if (state.selectedLayoutId !== chosen.id) selectLayout(chosen.id);
  }, [pathname, chosen?.id, chosen?.valid, state.layouts, state.selectedLayoutId, selectLayout]);

  const plan = state.plan ?? chosen?.items ?? [];
  const validation = geom && chosen?.valid ? validateLayout(geom, plan, state.budget) : null;
  const selected = plan.find(item => item.uid === selectedUid);

  const commitPosition = (uid: string, cx: number, cy: number) => {
    if (!geom || !chosen?.valid || !state.plan) return;
    const candidate: PlacedItem[] = state.plan.map(item =>
      item.uid === uid ? { ...item, cx, cy, wall: null } : item);
    const checked = validateLayout(geom, candidate, state.budget);
    if (!checked.valid) {
      setFeedback(checked.checks.find(c => !c.ok)?.detail ?? "This placement is not allowed.");
      return;
    }
    update({ plan: candidate });
    setSelectedUid(uid);
    setFeedback(null);
  };
  const rotate = () => {
    if (!selected || !geom || !state.plan) return;
    const candidate: PlacedItem[] = state.plan.map(item =>
      item.uid === selected.uid ? { ...item, facing: NEXT[item.facing], wall: null } : item);
    const checked = validateLayout(geom, candidate, state.budget);
    if (!checked.valid) {
      setFeedback(checked.checks.find(c => !c.ok)?.detail ?? "This rotation is not allowed.");
      return;
    }
    update({ plan: candidate });
    setFeedback(null);
  };
  const restore = () => {
    if (!chosen?.valid) return;
    selectLayout(chosen.id);
    setSelectedUid(null);
    setFeedback(null);
  };

  return (
    <WizardScaffold
      step={7}
      title="Your Room Layout"
      cta={{
        label: "Continue",
        icon: "arrow-right",
        disabled: !chosen?.valid || !state.plan || !validation?.valid,
        onPress: () => router.push("/plan/shop"),
        testID: "layouts-continue-button",
      }}
    >
      {!geom ? (
        <Notice tone="warning" text="Select a room first." testID="layouts-no-room" />
      ) : busy || !state.layouts ? (
        <Card style={s.loading} testID="layouts-loading">
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={s.caption}>Arranging your furniture…</Text>
        </Card>
      ) : !chosen?.valid ? (
        <Card testID="no-valid-layouts">
          <Notice tone="warning" text="The selected items do not fit safely. Try fewer or smaller items." />
          <Button label="Edit furniture" kind="secondary" onPress={() => router.push("/plan/furniture")} />
        </Card>
      ) : (
        <>
          <Text style={s.intro}>Drag furniture to move it. Tap a piece to rotate it.</Text>
          <Card style={s.layoutCard} testID="layout-card-0">
            <ConfiguredPlan
              items={plan}
              testID="layout-plan-0"
              editable
              showDims={false}
              selectedUid={selectedUid}
              onPressItem={uid => { setSelectedUid(uid); setFeedback(null); }}
              onMoveItem={commitPosition}
            />
          </Card>
          {selected ? (
            <Card style={s.selectedCard}>
              <View style={s.selectedRow}>
                <Text style={s.selectedName}>{getProduct(selected.productId).name}</Text>
                <Button kind="secondary" label="Rotate 90°" icon="rotate-cw"
                  onPress={rotate} testID="layout-rotate-selected" />
              </View>
            </Card>
          ) : null}
          {feedback ? <Notice tone="warning" text={feedback} testID="layout-move-error" /> : null}
          <View style={s.actions}>
            <Button kind="secondary" label="Reset positions" onPress={restore} testID="layout-reset" />
          </View>
        </>
      )}
    </WizardScaffold>
  );
}

const useStyles = makeStyles(c => ({
  loading: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  caption: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  intro: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurface },
  layoutCard: { padding: spacing.sm },
  selectedCard: { padding: spacing.md },
  selectedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  selectedName: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  actions: { flexDirection: "row", justifyContent: "center", paddingBottom: spacing.md },
}));
