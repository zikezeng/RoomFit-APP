import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Card, Notice, Stepper } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORIES } from "@/src/lib/catalog";
import { CategoryId } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function FurnitureStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const needs = state.needs;
  const selected = CATEGORIES.filter((c) => needs[c.id].qty > 0);
  const set = (id: CategoryId, patch: Partial<(typeof needs)[CategoryId]>) => update({ needs: { ...needs, [id]: { ...needs[id], ...patch } } }, "all");

  const section = (title: string, prio: "essential" | "optional") => {
    const list = CATEGORIES.filter((c) => needs[c.id].priority === prio);
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={s.h}>{title}</Text>
        {list.length === 0 ? <Text style={s.p}>None marked {prio}.</Text> : null}
        {list.map((c) => {
          const n = needs[c.id];
          const on = n.qty > 0;
          return (
            <View key={c.id} style={[s.item, on && s.itemOn]}>
              <Pressable testID={`furniture-card-${c.id}`} onPress={() => set(c.id, { qty: on ? 0 : 1 })} style={s.main}>
                <ProductSwatch category={c.id} size={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name}>{c.label}</Text>
                  <Text style={s.p}>{c.hint}</Text>
                </View>
              </Pressable>
              <Pressable testID={`priority-toggle-${c.id}`} hitSlop={6} onPress={() => set(c.id, { priority: prio === "essential" ? "optional" : "essential" })} style={s.prioBtn}>
                <Text style={s.prio}>{prio === "essential" ? "Essential" : "Optional"}</Text>
                <Text style={s.p}>switch</Text>
              </Pressable>
              {on && c.maxQty > 1 ? (
                <Stepper value={n.qty} min={0} max={c.maxQty} onChange={(v) => set(c.id, { qty: v })} testID={`qty-${c.id}`} />
              ) : (
                <Pressable testID={`furniture-toggle-${c.id}`} onPress={() => set(c.id, { qty: on ? 0 : 1 })} style={[s.check, on && s.checkOn]}>
                  <Text style={[s.checkText, on && { color: colors.onBrandPrimary }]}>{on ? "✓" : "+"}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <WizardScaffold
      step={3}
      title="What Does Your Room Need?"
      subtitle="Living room · tap to add or remove. You don't need everything."
      cta={{ label: `Continue with ${selected.reduce((a, c) => a + needs[c.id].qty, 0)} items`, disabled: selected.length === 0, onPress: () => router.push("/plan/style"), testID: "furniture-continue-button" }}
    >
      <Card testID="furniture-summary">
        <Text style={s.name}>Your selection</Text>
        <Text style={s.p} testID="furniture-summary-text">
          {selected.length ? selected.map((c) => `${needs[c.id].qty}× ${c.label}`).join(" · ") : "Nothing selected yet."}
        </Text>
      </Card>
      {selected.length === 0 ? <Notice tone="warning" text="Select at least one piece of furniture to continue." /> : null}
      {section("Essential", "essential")}
      {section("Optional", "optional")}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
  name: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  prio: { fontFamily: fonts.text, fontSize: 12, color: c.brandPrimary, fontWeight: "600" },
  prioBtn: { alignItems: "center", paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  itemOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  check: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  checkText: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurfaceTertiary },
}));
