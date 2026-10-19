import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Card, Notice, Stepper, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORIES } from "@/src/lib/catalog";
import { typicalCost } from "@/src/lib/ranking";
import { perUnitAllocation } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MIN = 300;
const MAX = 15000;

export default function BudgetStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [text, setText] = useState(String(state.budget));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(String(state.budget)), [state.budget]);

  const setBudget = (v: number) => update({ budget: Math.round(v) }, "layouts");
  const onText = (t: string) => {
    setText(t.replace(/[^0-9]/g, ""));
    const v = parseInt(t.replace(/[^0-9]/g, ""), 10);
    if (!t.trim() || isNaN(v)) return setErr("Enter a budget amount.");
    if (v < MIN) return setErr(`Budget must be at least ${money(MIN)}.`);
    if (v > MAX) return setErr(`Budget can be at most ${money(MAX)}.`);
    setErr(null);
    setBudget(v);
  };
  const prefs = { styles: state.styles, moods: state.moods };
  const sel = CATEGORIES.filter((c) => (state.needs[c.id]?.qty ?? 0) > 0);
  const customTotal = state.customItems.reduce((a, p) => a + p.price, 0);
  const alloc = perUnitAllocation(state.needs, state.allocations, Math.max(0, state.budget - customTotal));
  const estimate = customTotal + sel.reduce((sum, c) => sum + typicalCost(c.id, prefs) * state.needs[c.id]!.qty, 0);
  const remaining = state.budget - estimate;

  return (
    <WizardScaffold step={6} title="Let's Plan Your Budget" subtitle="Set your total furniture budget in USD. Allocations guide which price bands we pick per category." cta={{ label: "Generate layouts", icon: "grid", disabled: !!err, onPress: () => router.push("/plan/layouts"), testID: "budget-continue-button" }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={s.k}>Total budget</Text>
        <View style={s.amountRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput testID="budget-input" value={text} onChangeText={onText} keyboardType="number-pad" style={s.amount} />
        </View>
        <Slider
          testID="budget-slider"
          minimumValue={MIN}
          maximumValue={MAX}
          step={50}
          value={state.budget}
          onSlidingComplete={setBudget}
          minimumTrackTintColor={colors.brandPrimary}
          maximumTrackTintColor={colors.surfaceTertiary}
          thumbTintColor={colors.brandPrimary}
        />
        <View style={s.between}>
          <Text style={s.k}>{money(MIN)}</Text>
          <Text style={s.k}>{money(MAX)}</Text>
        </View>
        {err ? <Notice tone="error" text={err} testID="budget-error" /> : null}
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <View style={s.between}>
          <Text style={s.k}>Estimated cost (style-matched typical prices)</Text>
          <Text style={s.v} testID="budget-estimate">
            {money(estimate)}
          </Text>
        </View>
        <View style={s.between}>
          <Text style={s.k}>Remaining budget</Text>
          <Text style={[s.v, { color: remaining >= 0 ? colors.success : colors.error }]} testID="budget-remaining">
            {money(remaining)}
          </Text>
        </View>
        <View style={s.bar}>
          <View style={[s.fill, { width: `${Math.min(100, (estimate / state.budget) * 100)}%`, backgroundColor: remaining >= 0 ? colors.brandPrimary : colors.error }]} />
        </View>
      </Card>
      <Text style={s.h}>Category allocations</Text>
      {sel.map((c) => (
        <Card key={c.id} style={s.row} testID={`alloc-row-${c.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>
              {state.needs[c.id]!.qty}× {c.label}
            </Text>
            <Text style={s.k}>
              Allocated {money(alloc[c.id] * state.needs[c.id]!.qty)} · typical {money(typicalCost(c.id, prefs) * state.needs[c.id]!.qty)}
            </Text>
          </View>
          <Stepper value={state.allocations[c.id] ?? c.defaultPct} min={1} max={60} onChange={(v) => update({ allocations: { ...state.allocations, [c.id]: v } }, "layouts")} testID={`alloc-${c.id}`} />
        </Card>
      ))}
      <Text style={s.k}>Weights are relative; allocations always add up to your total budget.</Text>
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted, flexShrink: 1 },
  v: { fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.onSurface },
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  amountRow: { flexDirection: "row", alignItems: "center" },
  dollar: { fontFamily: fonts.display, fontSize: 40, color: c.muted },
  amount: { flex: 1, fontFamily: fonts.display, fontSize: 44, color: c.onSurface, paddingVertical: 0 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
}));
