import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORIES } from "@/src/lib/catalog";
import { typicalCost } from "@/src/lib/ranking";
import { perUnitAllocation } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MIN = 300;
const MAX = 15000;
const CHANGE_AMOUNT = 50;

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
    const clean = t.replace(/[^0-9]/g, "");
    setText(clean);
    const v = parseInt(clean, 10);
    if (!clean || isNaN(v)) return setErr("Enter a budget amount.");
    if (v < MIN) return setErr(`Budget must be at least ${money(MIN)}.`);
    if (v > MAX) return setErr(`Budget can be at most ${money(MAX)}.`);
    setErr(null);
    setBudget(v);
  };

  const prefs = { styles: state.styles, moods: state.moods };
  const selected = CATEGORIES.filter((c) => (state.needs[c.id]?.qty ?? 0) > 0);
  const customTotal = state.customItems.reduce((sum, p) => sum + p.price, 0);
  const pool = Math.max(0, state.budget - customTotal);
  const allocations = perUnitAllocation(state.needs, state.allocations, pool);
  const estimate = customTotal + selected.reduce(
    (sum, c) => sum + typicalCost(c.id, prefs) * state.needs[c.id]!.qty,
    0,
  );
  const remaining = state.budget - estimate;

  // Amounts are the user-facing representation of the existing allocation weights.
  // The solver continues receiving the same `state.allocations` data structure.
  const getCategoryTotal = (id: (typeof CATEGORIES)[number]["id"]) =>
    (allocations[id] ?? 0) * (state.needs[id]?.qty ?? 0);

  const changeCategoryBudget = (id: (typeof CATEGORIES)[number]["id"], delta: number) => {
    if (selected.length < 2 || pool <= 0) return;
    const category = selected.find((c) => c.id === id);
    if (!category) return;

    const quantity = state.needs[id]?.qty ?? 0;
    if (quantity <= 0) return;

    const oldTotal = getCategoryTotal(id);
    const nextTotal = Math.max(1, Math.min(pool - 1, oldTotal + delta));
    if (Math.abs(nextTotal - oldTotal) < 0.01) return;

    // Preserve every other category's weight. Solve for this category's new
    // weight so its total dollar share moves to the selected target.
    const othersWeighted = selected.reduce((sum, c) => {
      if (c.id === id) return sum;
      return sum + (state.allocations[c.id] ?? c.defaultPct) * state.needs[c.id]!.qty;
    }, 0);
    if (othersWeighted <= 0) return;

    const nextWeight = (nextTotal * othersWeighted) / (quantity * (pool - nextTotal));
    if (!Number.isFinite(nextWeight) || nextWeight <= 0) return;

    update({ allocations: { ...state.allocations, [id]: nextWeight } }, "layouts");
  };

  return (
    <WizardScaffold
      step={6}
      title="Let's Plan Your Budget"
      subtitle="Choose your total budget, then decide how much to spend on each furniture category."
      cta={{
        label: "Generate layouts",
        icon: "grid",
        disabled: !!err || pool <= 0 || selected.length === 0,
        onPress: () => router.push("/plan/layouts"),
        testID: "budget-continue-button",
      }}
    >
      <Card style={{ gap: spacing.md }}>
        <Text style={s.k}>Total budget</Text>
        <View style={s.amountRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            testID="budget-input"
            accessibilityLabel="Total furniture budget in dollars"
            value={text}
            onChangeText={onText}
            keyboardType="number-pad"
            style={s.amount}
          />
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
          <Text style={s.k}>Estimated furniture cost</Text>
          <Text style={s.v} testID="budget-estimate">{money(estimate)}</Text>
        </View>
        <View style={s.between}>
          <Text style={s.k}>Remaining after estimated purchases</Text>
          <Text style={[s.v, { color: remaining >= 0 ? colors.success : colors.error }]} testID="budget-remaining">
            {money(remaining)}
          </Text>
        </View>
        <View style={s.bar}>
          <View style={[s.fill, {
            width: `${state.budget > 0 ? Math.max(0, Math.min(100, (estimate / state.budget) * 100)) : 0}%`,
            backgroundColor: remaining >= 0 ? colors.brandPrimary : colors.error,
          }]} />
        </View>
        <Text style={s.k}>Estimated cost uses typical catalog prices, not your allocated spending limits.</Text>
      </Card>

      <Text style={s.h}>Furniture budget breakdown</Text>
      <Text style={s.description}>
        Choose how to split your budget. Use + or − to move about $50 between furniture categories.
      </Text>

      {customTotal > 0 ? (
        <View style={s.summaryRow}>
          <Text style={s.k}>Reserved for custom items</Text>
          <Text style={s.summaryValue}>{money(customTotal)}</Text>
        </View>
      ) : null}

      {selected.map((c) => {
        const quantity = state.needs[c.id]!.qty;
        const categoryTotal = getCategoryTotal(c.id);
        const typicalTotal = typicalCost(c.id, prefs) * quantity;
        const editable = selected.length > 1 && pool > 2;
        return (
          <Card key={c.id} style={s.categoryCard} testID={`alloc-row-${c.id}`}>
            <View style={s.between}>
              <Text style={s.name}>{quantity}× {c.label}</Text>
              <Text style={s.categoryAmount} testID={`alloc-amount-${c.id}`}>
                {money(Math.round(categoryTotal))}
              </Text>
            </View>
            <View style={s.between}>
              <Text style={s.k}>Typical price for {quantity}</Text>
              <Text style={s.k}>{money(typicalTotal)}</Text>
            </View>
            <View style={s.controlRow}>
              <Text style={s.adjustLabel}>Adjust allocation</Text>
              <View style={s.actions}>
                <Pressable
                  testID={`alloc-decrease-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease ${c.label} budget by $50`}
                  disabled={!editable || categoryTotal <= 1.01}
                  onPress={() => changeCategoryBudget(c.id, -CHANGE_AMOUNT)}
                  style={[s.adjustButton, (!editable || categoryTotal <= 1.01) && s.disabled]}
                >
                  <Text style={s.adjustText}>−</Text>
                </Pressable>
                <Text style={s.stepLabel}>$50</Text>
                <Pressable
                  testID={`alloc-increase-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${c.label} budget by $50`}
                  disabled={!editable || categoryTotal >= pool - 1.01}
                  onPress={() => changeCategoryBudget(c.id, CHANGE_AMOUNT)}
                  style={[s.adjustButton, (!editable || categoryTotal >= pool - 1.01) && s.disabled]}
                >
                  <Text style={s.adjustText}>+</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}

      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Total allocated</Text>
        <Text style={s.summaryValue}>{money(state.budget)}</Text>
      </View>
      <Text style={s.k}>
        Your total budget stays the same. Increasing one category reduces the amounts available to others.
        Actual products may cost less or more than these targets.
      </Text>
      {pool <= 0 ? <Notice tone="error" text="Your custom items use the full budget. Increase your budget to allocate money to furniture." /> : null}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted, flexShrink: 1 },
  v: { fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.onSurface },
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  description: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface, flexShrink: 1 },
  categoryAmount: { fontFamily: fonts.text, fontSize: 21, fontWeight: "700", color: c.onSurface },
  amountRow: { flexDirection: "row", alignItems: "center" },
  dollar: { fontFamily: fonts.display, fontSize: 40, color: c.muted },
  amount: { flex: 1, fontFamily: fonts.display, fontSize: 44, color: c.onSurface, paddingVertical: 0 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  categoryCard: { gap: spacing.sm, padding: spacing.md },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm },
  adjustLabel: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  adjustButton: { borderWidth: 1, borderColor: c.surfaceTertiary, borderRadius: radius.pill, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  adjustText: { fontFamily: fonts.text, fontSize: 22, color: c.onSurface },
  stepLabel: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  disabled: { opacity: 0.3 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  summaryLabel: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
  summaryValue: { fontFamily: fonts.text, fontSize: 17, fontWeight: "700", color: c.onSurface },
}));
