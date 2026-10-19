import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { FloorPlan } from "@/src/components/FloorPlan";
import { Button, Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { PRODUCT_MAP } from "@/src/lib/catalog";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function LayoutsStep() {
  const router = useRouter();
  const { state, generate, selectLayout } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const run = (seed: number) => {
    setBusy(true);
    setTimeout(() => {
      generate(seed);
      setBusy(false);
    }, 450);
  };
  useEffect(() => {
    if (!state.layouts) run(state.seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layouts]);

  const layouts = state.layouts ?? [];
  const validCount = layouts.filter((l) => l.valid).length;

  return (
    <WizardScaffold
      step={6}
      title="Your Personalized Room Designs"
      subtitle="Each layout is computed by a deterministic constraint solver using your confirmed room, door, windows, furniture and budget."
      cta={{ label: "Shop this layout", icon: "shopping-bag", disabled: !state.selectedLayoutId, onPress: () => router.push("/plan/shop"), testID: "layouts-continue-button" }}
      secondary={{ label: "Regenerate", onPress: () => run(state.seed + 1), testID: "regenerate-layouts-button" }}
    >
      {busy || !state.layouts ? (
        <Card style={s.loading} testID="layouts-loading">
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={s.p}>Placing furniture and checking constraints…</Text>
        </Card>
      ) : (
        <>
          <Text style={s.p} testID="layouts-summary">
            Set #{state.seed + 1} · {validCount} of {layouts.length} layouts satisfy every constraint. Budget {money(state.budget)}.
          </Text>
          {validCount === 0 ? <Notice tone="error" text="No valid layout for this combination. Remove optional furniture, choose a larger room measurement, or raise the budget." testID="no-valid-layouts" /> : null}
          {layouts.map((l, idx) => {
            const sel = state.selectedLayoutId === l.id;
            return (
              <Card key={l.id} style={[s.card, sel && s.cardSel]} testID={`layout-card-${idx}`}>
                <View style={s.head}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{l.name}</Text>
                    <Text style={s.p}>{l.tagline}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.price} testID={`layout-total-${idx}`}>
                      {money(l.total)}
                    </Text>
                    <Text style={[s.badge, { color: l.valid ? colors.success : colors.error }]}>{l.valid ? "Valid" : "Not valid"}</Text>
                  </View>
                </View>
                {l.valid ? (
                  <>
                    <FloorPlan room={state.room} items={l.items} testID={`layout-plan-${idx}`} />
                    <View style={s.checks}>
                      {l.checks.map((c) => (
                        <View key={c.id} style={s.check}>
                          <Feather name={c.ok ? "check-circle" : "x-circle"} size={14} color={c.ok ? colors.success : colors.error} />
                          <Text style={s.checkText}>{c.label}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.caption}>{l.items.map((i) => PRODUCT_MAP[i.productId].name).join(" · ")}</Text>
                    <Text style={s.caption}>Remaining budget: {money(state.budget - l.total)}</Text>
                    <Button kind={sel ? "primary" : "secondary"} small icon={sel ? "check" : undefined} label={sel ? "Selected" : "Choose this layout"} onPress={() => selectLayout(l.id)} testID={`select-layout-${idx}`} />
                  </>
                ) : (
                  <View style={{ gap: spacing.sm }} testID={`layout-invalid-${idx}`}>
                    {l.problems.map((p) => (
                      <Notice key={p} tone="error" text={p} />
                    ))}
                    {l.suggestions.map((p) => (
                      <Text key={p} style={s.caption}>
                        Suggestion: {p}
                      </Text>
                    ))}
                    <Pressable onPress={() => router.push("/plan/furniture")} testID={`edit-furniture-from-layout-${idx}`}>
                      <Text style={s.link}>Edit furniture selection</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  loading: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
  caption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  card: { gap: spacing.md, borderWidth: 2, borderColor: c.border },
  cardSel: { borderColor: c.brandPrimary },
  head: { flexDirection: "row", gap: spacing.md },
  name: { fontFamily: fonts.display, fontSize: 19, color: c.onSurface },
  price: { fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.onSurface },
  badge: { fontFamily: fonts.text, fontSize: 12, fontWeight: "700" },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  check: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: c.surface, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  checkText: { fontFamily: fonts.text, fontSize: 12, color: c.onSurfaceTertiary },
  link: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.brandPrimary },
}));
