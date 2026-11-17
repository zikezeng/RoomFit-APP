import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Card, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORIES } from "@/src/lib/catalog";
import { typicalCost } from "@/src/lib/ranking";
import { perUnitAllocation } from "@/src/lib/solver";
import { configsOf, defaultNeeds, usePlan } from "@/src/state/plan-store";
import { CategoryId } from "@/src/lib/types";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MAX_TOTAL = 150000;
const WARNING_THRESHOLD = 0.9;
const digits = (text: string) => text.replace(/[^0-9]/g, "");
type Category = (typeof CATEGORIES)[number];

interface CategoryRowProps {
  category: Category;
  quantity: number;
  amount: number;
  typical: number;
  limit: number;
  onCommit: (amount: number) => void;
}

function CategoryRow({ category, quantity, amount, typical, limit, onCommit }: CategoryRowProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const [draft, setDraft] = useState(String(Math.round(amount)));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(Math.round(amount)));
  }, [editing, amount]);
  const commit = () => {
    setEditing(false);
    const n = Number(draft || "0");
    const value = Number.isFinite(n) ? Math.max(0, Math.min(MAX_TOTAL, Math.round(n))) : 0;
    setDraft(String(value));
    onCommit(value);
  };
  const sliderMax = Math.max(100, limit, amount);
  return (
    <Card style={s.categoryCard} testID={`alloc-row-${category.id}`}>
      <View style={s.between}>
        <Text style={s.name}>{quantity}× {category.label}</Text>
        <View style={s.categoryInputRow}>
          <Text style={s.currency}>$</Text>
          <TextInput
            testID={`alloc-input-${category.id}`}
            accessibilityLabel={`${category.label} target in dollars`}
            style={s.categoryInput}
            keyboardType="number-pad"
            selectTextOnFocus
            value={draft}
            onFocus={() => setEditing(true)}
            onChangeText={t => setDraft(digits(t))}
            onBlur={commit}
            onSubmitEditing={commit}
          />
        </View>
      </View>
      <View style={s.between}>
        <Text style={s.k}>Typical cost for {quantity}</Text>
        <Text style={s.k}>{money(typical)}</Text>
      </View>
      <Slider
        testID={`alloc-slider-${category.id}`}
        minimumValue={0}
        maximumValue={sliderMax}
        step={25}
        value={Math.min(amount, sliderMax)}
        onSlidingComplete={v => { setEditing(false); onCommit(Math.round(v)); }}
        minimumTrackTintColor={colors.brandPrimary}
        maximumTrackTintColor={colors.surfaceTertiary}
        thumbTintColor={colors.brandPrimary}
      />
      <Text style={s.k}>Drag to adjust or type an amount above.</Text>
    </Card>
  );
}

export default function BudgetStep() {
  const { state } = usePlan();
  return <ApartmentBudget key={state.selectedRoomId ?? "none"} />;
}

function ApartmentBudget() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();

  const prefs = { styles: state.styles, moods: state.moods };
  const configs = configsOf(state);
  const roomIds = state.selectedRoomIds.length
    ? state.selectedRoomIds : state.selectedRoomId ? [state.selectedRoomId] : [];
  const summary = roomIds.map(id => {
    const room = state.apartment.rooms.find(r => r.id === id);
    const config = configs[id];
    const needs = config?.needs ?? defaultNeeds(room?.kind ?? "living", state.apartment.homeType);
    const custom = config?.customItems ?? [];
    const items = CATEGORIES.filter(cat => (needs[cat.id]?.qty ?? 0) > 0);
    const customCost = custom.reduce((sum, item) => sum + item.price, 0);
    const estimate = customCost + items.reduce((sum, cat) =>
      sum + (needs[cat.id]?.qty ?? 0) * typicalCost(cat.id, prefs), 0);
    const targets = config?.categoryBudgets ?? {};
    const defaultSplit = perUnitAllocation(needs, config?.allocations ?? state.allocations,
      Math.max(0, (config?.budget ?? state.budget) - customCost));
    const planned = customCost + items.reduce((sum, cat) => {
      const qty = needs[cat.id]!.qty;
      const existing = targets[cat.id];
      const fallback = Object.keys(targets).length
        ? typicalCost(cat.id, prefs) * qty
        : (defaultSplit[cat.id] ?? 0) * qty;
      return sum + (existing ?? fallback);
    }, 0);
    return { id, name: room?.label ?? "Room", items, needs, targets, defaultSplit, customCost, estimate, planned };
  });
  const active = summary.find(row => row.id === state.selectedRoomId);
  const roomName = active?.name ?? "Selected room";
  const estimated = summary.reduce((sum, row) => sum + row.estimate, 0);
  const planned = summary.reduce((sum, row) => sum + row.planned, 0);
  const comparison = Math.max(estimated, planned);
  const usage = state.apartmentBudget > 0 ? comparison / state.apartmentBudget : 0;
  const over = usage > 1;
  const near = !over && usage >= WARNING_THRESHOLD;
  const accent = over ? colors.error : near ? colors.warning : colors.success;
  const remaining = state.apartmentBudget - comparison;

  const saveCategory = (id: CategoryId, dollars: number) => {
    if (!active) return;
    const next = { ...active.targets };
    // Initialize every selected category's explicit value before changing one.
    for (const cat of active.items) {
      if (next[cat.id] == null)
        next[cat.id] = Math.round((active.defaultSplit[cat.id] ?? 0) * active.needs[cat.id]!.qty);
    }
    next[id] = dollars;
    update({ categoryBudgets: next }, "layouts");
  };

  return (
    <WizardScaffold
      step={6}
      title="Let's Plan Your Budget"
      subtitle="Adjust furniture spending targets for each category within your apartment budget."
      keyboardAware
      cta={{
        label: "Generate layouts",
        icon: "grid",
        disabled: !roomIds.length || !active?.items.length || active.planned <= 0,
        onPress: () => router.push("/plan/layouts"),
        testID: "budget-continue-button",
      }}
    >
      <Text style={s.h}>Furniture budget breakdown</Text>
      <Text style={s.description}>
        {roomName}: type a target for each category, or drag the slider. Targets are independent.
      </Text>
      {active && active.customCost > 0 ? (
        <View style={s.summaryRow}>
          <Text style={s.k}>Custom items in {roomName}</Text>
          <Text style={s.summaryValue}>{money(active.customCost)}</Text>
        </View>
      ) : null}
      {active?.items.map(cat => {
        const qty = active.needs[cat.id]!.qty;
        const typical = typicalCost(cat.id, prefs) * qty;
        const amount = active.targets[cat.id] ??
          (Object.keys(active.targets).length ? typical : (active.defaultSplit[cat.id] ?? 0) * qty);
        return <CategoryRow
          key={cat.id}
          category={cat}
          quantity={qty}
          typical={typical}
          amount={amount}
          limit={state.apartmentBudget}
          onCommit={value => saveCategory(cat.id, value)}
        />;
      })}
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Planned for {roomName}</Text>
        <Text style={s.summaryValue}>{money(active?.planned ?? 0)}</Text>
      </View>
      {summary.length > 1 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={s.name}>All selected rooms</Text>
          {summary.map(row => (
            <View key={row.id} style={s.between}>
              <Text style={s.k}>{row.name}</Text>
              <Text style={s.summaryValue}>{money(row.planned)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Card style={[s.estimateCard, near && s.warnCard, over && s.overCard]} testID="budget-estimate-card">
        <Text style={s.h}>Estimated furniture cost</Text>
        <Text style={s.k}>All selected rooms · typical catalog prices</Text>
        <View style={s.between}>
          <Text style={s.k}>Estimated cost</Text>
          <Text style={s.bigValue} testID="budget-estimate">{money(estimated)}</Text>
        </View>
        <View style={s.between}>
          <Text style={s.k}>Furniture spending targets</Text>
          <Text style={s.summaryValue} testID="budget-planned">{money(planned)}</Text>
        </View>
        <View style={s.between}>
          <Text style={s.k}>Remaining budget</Text>
          <Text style={[s.bigValue, { color: accent }]} testID="budget-remaining">{money(remaining)}</Text>
        </View>
        <View style={s.bar}>
          <View style={[s.fill, {
            width: `${Math.min(100, usage * 100)}%`,
            backgroundColor: accent,
          }]} />
        </View>
        {over ? (
          <Text style={[s.status, { color: colors.error }]}>
            Over budget. Reduce furniture targets or increase the total budget.
          </Text>
        ) : near ? (
          <Text style={[s.status, { color: colors.warning }]}>
            Close to the budget limit (90% or more). Consider leaving a buffer.
          </Text>
        ) : (
          <Text style={[s.status, { color: colors.success }]}>
            Within budget. Allow for unexpected costs.
          </Text>
        )}
        <Text style={s.k}>
          The warning uses the higher of catalog estimates and spending targets.
          Actual purchases may differ.
        </Text>
      </Card>
    </WizardScaffold>
  );
}

const useStyles = makeStyles(c => ({
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted, flexShrink: 1 },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface, flexShrink: 1 },
  description: { fontFamily: fonts.text, fontSize: 13, lineHeight: 20, color: c.muted },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  categoryCard: { gap: spacing.sm, padding: spacing.md },
  categoryInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, minWidth: 110 },
  currency: { fontFamily: fonts.text, fontSize: 17, color: c.muted },
  categoryInput: { width: 94, minHeight: 40, textAlign: "right", fontFamily: fonts.text,
    fontSize: 19, color: c.onSurface, fontWeight: "700", paddingVertical: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  summaryLabel: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
  summaryValue: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  estimateCard: { gap: spacing.md, borderWidth: 2, borderColor: c.border },
  warnCard: { borderColor: c.warning, backgroundColor: c.warning + "12" },
  overCard: { borderColor: c.error, backgroundColor: c.error + "12" },
  bigValue: { fontFamily: fonts.text, fontSize: 20, color: c.onSurface, fontWeight: "700" },
  status: { fontFamily: fonts.text, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
}));
