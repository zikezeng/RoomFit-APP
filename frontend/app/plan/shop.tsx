import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BudgetBar } from "@/src/components/BudgetBar";
import { FloorPlan } from "@/src/components/FloorPlan";
import { ProductSheet } from "@/src/components/ProductSheet";
import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { getProduct } from "@/src/lib/catalog";
import { validateLayout } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ShopStep() {
  const router = useRouter();
  const { state, geom } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [uid, setUid] = useState<string | null>(null);
  const plan = state.plan;
  const v = plan && geom ? validateLayout(geom, plan, state.budget) : null;

  return (
    <WizardScaffold
      step={8}
      title="Shop Your Room"
      subtitle="Tap any piece on the floor plan to see details and swap alternatives."
      cta={plan ? { label: "View final plan", icon: "check", onPress: () => router.push("/plan/results"), testID: "shop-continue-button" } : undefined}
      header={v ? <BudgetBar total={v.total} budget={state.budget} /> : undefined}
    >
      {!plan || !v || !geom ? (
        <View style={{ gap: spacing.md }}>
          <Notice tone="warning" text="No layout selected yet — inputs may have changed. Generate and choose a layout first." testID="shop-no-plan" />
          <Button label="Go to layouts" onPress={() => router.replace("/plan/layouts")} testID="shop-go-layouts" />
        </View>
      ) : (
        <>
          <Card>
            <FloorPlan geom={geom!} items={plan} selectedUid={uid} onPressItem={setUid} testID="shop-floorplan-svg" />
            <View style={s.status}>
              <Feather name={v.valid ? "check-circle" : "alert-circle"} size={14} color={v.valid ? colors.success : colors.error} />
              <Text style={s.caption} testID="shop-validity">
                {v.valid ? "Layout valid · fits, no overlaps, door & 80 cm walkways clear, within budget" : v.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ")}
              </Text>
            </View>
          </Card>
          <Text style={s.h}>Items in this room</Text>
          {plan.map((it) => {
            const p = getProduct(it.productId);
            return (
              <Pressable key={it.uid} onPress={() => setUid(it.uid)} testID={`shop-item-${it.uid}`} style={({ pressed }) => [s.item, pressed && { opacity: 0.8 }]}>
                <ProductSwatch category={p.category} style={p.styles[0]} size={52} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={s.caption}>
                    {p.width}×{p.depth}×{p.height} cm · {p.retailer}
                  </Text>
                </View>
                <Text style={s.price} testID={`shop-item-price-${it.uid}`}>
                  {money(p.price)}
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
  status: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.sm },
  caption: { flex: 1, fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  price: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
}));
