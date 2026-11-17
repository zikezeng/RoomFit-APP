import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BudgetBar } from "@/src/components/BudgetBar";
import { ConfiguredPlan } from "@/src/components/ConfiguredPlan";
import { ProductSheet } from "@/src/components/ProductSheet";
import { Button, Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORY_MAP, getProduct } from "@/src/lib/catalog";
import { validatePlan } from "@/src/lib/multi-room";
import { fitCheck, sizeText } from "@/src/lib/product-fit";
import { budgetNote, shoppingTotals } from "@/src/lib/shopping-totals";
import { totalBudget, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const FURNITURE_EMOJI: Record<string, string> = {
  sofa: "🛋️", coffee_table: "☕", tv_stand: "📺", armchair: "🪑",
  floor_lamp: "💡", dining_table: "🍽️", dining_chair: "🪑",
  shoe_cabinet: "👟", cabinet: "🗄️", bed_frame: "🛏️", mattress: "🛏️",
  nightstand: "🗄️", wardrobe: "👕", desk: "💻", study_chair: "🪑",
  dresser: "🗄️", side_table: "☕", bookshelf: "📚", rug: "🧶",
  console_table: "🗄️", ottoman: "🛋️", bench: "🪑",
  floor_mirror: "🪞", planter: "🪴", custom: "📦",
};

export default function ShopStep() {
  const router = useRouter();
  const { state, geom } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [uid, setUid] = useState<string | null>(null);
  const plan = state.plan;
  const v = plan && geom ? validatePlan(state, plan) : null;
  const budget = totalBudget(state);

  // Budget follows what the user has really chosen:
  //  - a chosen real product counts at its real price;
  //  - the user's own custom items count at the price they entered;
  //  - positions with nothing chosen yet count as $0 (their demo price is only a planning estimate).
  const totals = shoppingTotals((plan ?? []).map((item) => ({ item, real: state.realSelections[item.uid] })));
  const { spent, chosen } = totals;
  const remaining = budget - spent;
  const overBudget = remaining < 0;
  const note = budgetNote(totals, budget, money);

  // Room checks (fit, overlaps, door, walkways) still come from the layout; the budget check uses real prices.
  const roomFails = v ? v.checks.filter((c) => !c.ok && !c.id.endsWith(":budget")) : [];
  const allOk = roomFails.length === 0 && !overBudget;
  const statusText = allOk
    ? `Layout fits · no overlaps, door & walkways clear · ${money(spent)} of ${money(budget)} used`
    : [...roomFails.map((c) => c.detail), overBudget ? `Over budget by ${money(-remaining)} — pick a cheaper product or raise the budget.` : null].filter(Boolean).join(" ");

  // Name each layout position by furniture type ("Sofa", "Dining chair 2"…).
  const slotLabels: Record<string, string> = {};
  if (plan) {
    const totals: Record<string, number> = {};
    const seen: Record<string, number> = {};
    const cats = plan.map((it) => getProduct(it.productId).category);
    cats.forEach((c) => (totals[c] = (totals[c] ?? 0) + 1));
    plan.forEach((it, i) => {
      const c = cats[i];
      seen[c] = (seen[c] ?? 0) + 1;
      slotLabels[it.uid] = CATEGORY_MAP[c].label + (totals[c] > 1 ? ` ${seen[c]}` : "");
    });
  }

  return (
    <WizardScaffold
      step={8}
      title="Shop Your Room"
      subtitle="Tap a piece on the plan, or a Choose button below, to pick a real product to buy for that spot."
      cta={plan ? { label: "View final plan", icon: "check", onPress: () => router.push("/plan/results"), testID: "shop-continue-button" } : undefined}
      header={
        v && plan ? (
          <View style={{ gap: 4 }}>
            <BudgetBar total={spent} budget={budget} />
            <Text style={s.budgetNote} testID="shop-budget-note">
              {note}
            </Text>
          </View>
        ) : undefined
      }
    >
      {!plan || !v || !geom ? (
        <View style={{ gap: spacing.md }}>
          <Notice tone="warning" text="No layout selected yet — inputs may have changed. Generate and choose a layout first." testID="shop-no-plan" />
          <Button label="Go to layouts" onPress={() => router.replace("/plan/layouts")} testID="shop-go-layouts" />
        </View>
      ) : (
        <>
          <Card>
            <ConfiguredPlan items={plan} showFurnitureEmoji showDims={false} selectedUid={uid} onPressItem={setUid} testID="shop-floorplan-svg" />
            <View style={s.status}>
              <Feather name={allOk ? "check-circle" : "alert-circle"} size={14} color={allOk ? colors.success : colors.error} />
              <Text style={s.caption} testID="shop-validity">
                {statusText}
              </Text>
            </View>
            <Button kind="secondary" small label="Preview in 3D" icon="box" onPress={() => router.push("/plan/preview3d")} testID="shop-preview3d-button" style={{ marginTop: spacing.md }} />
          </Card>
          <View style={s.hRow}>
            <Text style={s.h}>Selected furniture</Text>
            <Text style={s.count} testID="shop-chosen-count">
              {chosen} of {plan.length} chosen
            </Text>
          </View>
          {plan.map((it) => {
            const p = getProduct(it.productId);
            const selected = state.realSelections[it.uid];
            const isCustom = p.category === "custom";
            const label = isCustom ? p.name : slotLabels[it.uid];
            const space = `${p.width}×${p.depth} cm`;

            // Nothing chosen yet: show a "choose" button for this layout position instead of
            // the demo catalog entry (its name, retailer and price are not real products).
            if (!selected && !isCustom) {
              return (
                <Pressable key={it.uid} onPress={() => setUid(it.uid)} testID={`shop-item-${it.uid}`} style={({ pressed }) => [s.item, s.itemEmpty, pressed && { opacity: 0.8 }]}>
                  <View style={s.emojiBox}><Text style={s.emoji}>{FURNITURE_EMOJI[p.category] ?? "📦"}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.name}>{label}</Text>
                    <Text style={s.caption}>Not chosen yet · space in layout {space}</Text>
                  </View>
                  <View style={s.chooseBtn}>
                    <Feather name="shopping-bag" size={14} color={colors.onBrandPrimary} />
                    <Text style={s.chooseLabel}>Choose</Text>
                  </View>
                </Pressable>
              );
            }

            const displayPrice = selected ? selected.price_text ?? (selected.price !== null ? money(selected.price) : "See price") : money(p.price);
            return (
              <Pressable key={it.uid} onPress={() => setUid(it.uid)} testID={`shop-item-${it.uid}`} style={({ pressed }) => [s.item, selected && s.itemSelected, pressed && { opacity: 0.8 }]}>
                {selected?.image ? (
                  <Image source={{ uri: selected.image }} style={s.realThumb} contentFit="cover" transition={120} />
                ) : (
                  <View style={s.emojiBox}><Text style={s.emoji}>{FURNITURE_EMOJI[p.category] ?? "📦"}</Text></View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  {selected ? <Text style={s.slot}>{label}</Text> : null}
                  <Text style={s.name} numberOfLines={2}>
                    {selected?.title ?? p.name}
                  </Text>
                  {selected ? (
                    <>
                      <Text style={s.caption}>{selected.retailer}</Text>
                      <Text style={s.proxy}>Real size: {sizeText(selected.details)}</Text>
                      {(() => {
                        const fit = fitCheck(selected.details, { geom, item: it, others: plan });
                        return (
                          <Text style={[s.proxy, fit.level === "warn" && { color: colors.error }, fit.level === "ok" && { color: colors.success }]} testID={`shop-item-fit-${it.uid}`}>
                            {fit.level === "unknown" ? `Planned spot: ${space}` : fit.text}
                            {fit.note ? ` ${fit.note}` : ""}
                          </Text>
                        );
                      })()}
                    </>
                  ) : (
                    <Text style={s.caption}>
                      Your own item · {p.width}×{p.depth}×{p.height} cm
                    </Text>
                  )}
                </View>
                <Text style={s.price} testID={`shop-item-price-${it.uid}`}>
                  {displayPrice}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </>
      )}
      <ProductSheet uid={uid} onClose={() => setUid(null)} />
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  hRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  budgetNote: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  count: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  itemEmpty: { borderStyle: "dashed", borderColor: c.borderStrong },
  chooseBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.brandPrimary },
  chooseLabel: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onBrandPrimary },
  slot: { fontFamily: fonts.text, fontSize: 11, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  status: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.sm },
  caption: { flex: 1, fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  emojiBox: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.brandTertiary },
  emoji: { fontSize: 29 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  itemSelected: { borderColor: c.success, borderWidth: 2 },
  realThumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  proxy: { fontFamily: fonts.text, fontSize: 11, lineHeight: 15, color: c.muted },
  price: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
}));
