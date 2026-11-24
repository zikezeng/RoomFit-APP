import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { ConfiguredPlan } from "@/src/components/ConfiguredPlan";
import { Button, Card, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { getProduct } from "@/src/lib/catalog";
import { spatialFails, validateLayout } from "@/src/lib/solver";
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
  const [draggingFurniture, setDraggingFurniture] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (pathname !== "/plan/layouts" || state.layouts || !geom) return;
    const timer = setTimeout(() => { generate(state.seed); setBusy(false); }, 450);
    return () => clearTimeout(timer);
  }, [pathname, state.layouts, geom, state.seed, generate]);

  // Show one layout: the first fully valid one, or else the closest one the solver found
  // (generateLayouts puts it first). The user always gets a plan to work with.
  const chosen = useMemo(() => state.layouts?.find(l => l.valid) ?? state.layouts?.[0],
    [state.layouts]);
  const hasPlan = !!chosen && chosen.items.length > 0;

  useEffect(() => {
    if (pathname !== "/plan/layouts" || !hasPlan || !chosen || !state.layouts) return;
    if (state.selectedLayoutId !== chosen.id) selectLayout(chosen.id);
  }, [pathname, hasPlan, chosen, state.layouts, state.selectedLayoutId, selectLayout]);

  const plan = state.plan ?? chosen?.items ?? [];
  // Room rules only: the budget check uses demo placeholder prices, real prices are chosen in Step 8.
  const fails = geom && hasPlan ? spatialFails(validateLayout(geom, plan, state.budget).checks) : [];
  const missing = chosen?.missing ?? [];
  const selected = plan.find(item => item.uid === selectedUid);

  /** An edit is allowed if it keeps every room rule that the current plan already meets. */
  const firstNewProblem = (candidate: PlacedItem[]) => {
    if (!geom) return "This placement is not allowed.";
    const before = new Set(fails.map(c => c.id));
    const broken = spatialFails(validateLayout(geom, candidate, state.budget).checks).find(c => !before.has(c.id));
    return broken ? broken.detail : null;
  };

  const commitPosition = (uid: string, cx: number, cy: number) => {
    if (!geom || !hasPlan || !state.plan) return;
    const candidate: PlacedItem[] = state.plan.map(item =>
      item.uid === uid ? { ...item, cx, cy, wall: null } : item);
    const problem = firstNewProblem(candidate);
    if (problem) {
      setFeedback(problem);
      return;
    }
    update({ plan: candidate });
    setSelectedUid(uid);
    setFeedback(null);
  };
  const rotate = () => {
    if (!selected || !geom || !state.plan) return;
    // Turning a piece changes its rectangular footprint. A wall-adjacent item
    // may need a small shift to remain inside the room after a 90-degree turn.
    const face = NEXT[selected.facing];
    const directions = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const radius of [0, 10, 20, 30, 40, 50, 60, 80, 100]) {
      for (const [vx, vy] of directions) {
        const candidate: PlacedItem[] = state.plan.map(item =>
          item.uid === selected.uid
            ? { ...item, cx: item.cx + vx * radius, cy: item.cy + vy * radius, facing: face, wall: null }
            : item);
        if (!firstNewProblem(candidate)) {
          update({ plan: candidate });
          setFeedback(null);
          return;
        }
      }
    }
    setFeedback("Not enough clear space to rotate this furniture. Try moving it farther from the wall first.");
  };
  const restore = () => {
    if (!hasPlan || !chosen) return;
    selectLayout(chosen.id);
    setSelectedUid(null);
    setFeedback(null);
  };

  return (
    <WizardScaffold
      step={7}
      title="Your Room Layout"
      scrollEnabled={!draggingFurniture}
      cta={{
        label: "Continue",
        icon: "arrow-right",
        disabled: !hasPlan || !state.plan,
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
      ) : !hasPlan ? (
        <Card testID="no-valid-layouts">
          <Notice tone="warning" text={chosen?.problems[0] ?? "None of the selected items fit in this room. Try fewer or smaller items."} />
          <Button label="Edit furniture" kind="secondary" onPress={() => router.push("/plan/furniture")} testID="no-valid-layouts-edit-furniture" />
        </Card>
      ) : (
        <>
          {missing.length || fails.length ? (
            <Card style={s.issueCard} testID="layout-issues">
              <Notice
                tone="warning"
                text={[
                  missing.length ? `Not enough room for: ${missing.join(", ")}. ${missing.length > 1 ? "They were" : "It was"} left out of this plan.` : null,
                  ...fails.map(c => c.detail),
                  "You can still adjust the pieces and continue, or change your furniture.",
                ].filter(Boolean).join(" ")}
                testID="layout-issues-text"
              />
              <Button label="Edit furniture" kind="secondary" small onPress={() => router.push("/plan/furniture")} testID="layout-issues-edit-furniture" />
            </Card>
          ) : null}
          <Text style={s.intro}>Drag a piece to move it. Tap furniture, then use Rotate 90° to turn it.</Text>
          <Card style={s.layoutCard} testID="layout-card-0">
            <ConfiguredPlan
              items={plan}
              testID="layout-plan-0"
              editable
              showDims={false}
              selectedUid={selectedUid}
              onPressItem={uid => { setSelectedUid(uid); setFeedback(null); }}
              onMoveItem={commitPosition}
              onDragStateChange={setDraggingFurniture}
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
  issueCard: { gap: spacing.sm },
  selectedCard: { padding: spacing.md },
  selectedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  selectedName: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  actions: { flexDirection: "row", justifyContent: "center", paddingBottom: spacing.md },
}));
