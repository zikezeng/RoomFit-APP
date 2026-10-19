import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Share, Text, View } from "react-native";

import { BudgetBar } from "@/src/components/BudgetBar";
import { FloorPlan } from "@/src/components/FloorPlan";
import { ProductSheet } from "@/src/components/ProductSheet";
import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Card, Notice, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { CATEGORY_MAP, getProduct } from "@/src/lib/catalog";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { validateLayout } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

export default function ResultsStep() {
  const router = useRouter();
  const { state, geom, reset } = usePlan();
  const s = useStyles();
  const [uid, setUid] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const plan = state.plan;
  const v = plan && geom ? validateLayout(geom, plan, state.budget) : null;
  const products = (plan ?? []).map((i) => getProduct(i.productId));

  const csv = () => {
    const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    const rows = [["Category", "Name", "Width (cm)", "Depth (cm)", "Height (cm)", "Price (USD)", "Retailer", "Link"]];
    products.forEach((p) => rows.push([CATEGORY_MAP[p.category].label, p.name, String(p.width), String(p.depth), String(p.height), String(p.price), p.retailer, p.url ?? "Not verified (demo)"]));
    rows.push(["", "TOTAL", "", "", "", String(v?.total ?? 0), "", ""], ["", "BUDGET", "", "", "", String(state.budget), "", ""]);
    return rows.map((r) => r.map(esc).join(",")).join("\n");
  };
  const download = async () => {
    const data = csv();
    if (Platform.OS === "web") {
      const blob = new Blob([data], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "roomfit-shopping-list.csv";
      a.click();
      setMsg("Shopping list downloaded as CSV.");
    } else {
      await Share.share({ message: data, title: "RoomFit shopping list (CSV)" });
    }
  };
  const print = async () => {
    if (Platform.OS === "web") window.print();
    else await Share.share({ message: `My RoomFit plan (${geom?.label})\n` + products.map((p) => `• ${p.name} — ${money(p.price)}`).join("\n") + `\nTotal ${money(v?.total ?? 0)} of ${money(state.budget)}` });
  };

  if (!plan || !v || !geom) {
    return (
      <WizardScaffold step={9} title="Your RoomFit Plan Is Ready!">
        <Notice tone="warning" text="No layout selected yet. Choose a layout to see your final plan." testID="results-no-plan" />
        <Button label="Go to layouts" onPress={() => router.replace("/plan/layouts")} testID="results-go-layouts" />
      </WizardScaffold>
    );
  }

  return (
    <WizardScaffold step={9} title="Your RoomFit Plan Is Ready!" subtitle={`${geom.label} · ${fmtLen(geom.width, geom.unit)} × ${fmtLen(geom.length, geom.unit)} · ${fmtAreaCm2(geom.area, geom.unit)}`}>
      <Card style={{ gap: spacing.sm }}>
        <FloorPlan geom={geom} items={plan} selectedUid={uid} onPressItem={setUid} testID="results-floorplan-svg" />
        <Notice tone={v.valid ? "success" : "error"} text={v.valid ? "Validated placement: inside walls, no overlaps, door clear, 80 cm walkways, within budget." : v.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ")} testID="results-validity" />
      </Card>
      <Card style={{ gap: spacing.md }} testID="budget-summary">
        <Text style={s.h}>Budget summary</Text>
        <View style={s.stats}>
          {[
            ["Budget", state.budget, "summary-budget"],
            ["Furniture", v.total, "summary-total"],
            ["Remaining", state.budget - v.total, "summary-remaining"],
          ].map(([k, n, id]) => (
            <View key={k as string} style={s.stat}>
              <Text style={s.k}>{k}</Text>
              <Text style={s.v} testID={id as string}>
                {money(n as number)}
              </Text>
            </View>
          ))}
        </View>
        <BudgetBar total={v.total} budget={state.budget} />
      </Card>
      <Text style={s.h}>Shopping list</Text>
      {products.map((p, i) => (
        <Card key={plan[i].uid} style={s.item} testID={`list-item-${plan[i].uid}`}>
          <ProductSwatch category={p.category} style={p.styles[0]} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name}>{p.name}</Text>
            <Text style={s.k}>
              {p.width}×{p.depth}×{p.height} cm · {p.retailer}
            </Text>
            <Text style={s.k}>{p.url ? p.url : "No verified link (demo product)"}</Text>
          </View>
          <Text style={s.price}>{money(p.price)}</Text>
        </Card>
      ))}
      {msg ? <Notice tone="success" text={msg} testID="results-message" /> : null}
      <View style={s.actions}>
        <Button small label="Download CSV" icon="download" onPress={download} testID="download-csv-button" style={s.action} />
        <Button small kind="secondary" label="Print / Save" icon="printer" onPress={print} testID="print-button" style={s.action} />
        <Button small kind="secondary" label="Edit Furniture" icon="edit-3" onPress={() => router.push("/plan/furniture")} testID="edit-furniture-button" style={s.action} />
        <Button small kind="secondary" label="Change Layout" icon="grid" onPress={() => router.push("/plan/layouts")} testID="change-layout-button" style={s.action} />
        <Button small kind="secondary" label="Edit Budget" icon="dollar-sign" onPress={() => router.push("/plan/budget")} testID="edit-budget-button" style={s.action} />
        <Button
          small
          kind="ghost"
          label="Start Over"
          icon="rotate-ccw"
          onPress={() => {
            reset();
            router.replace("/");
          }}
          testID="start-over-button"
          style={s.action}
        />
      </View>
      <ProductSheet uid={uid} onClose={() => setUid(null)} />
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  h: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md },
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  v: { fontFamily: fonts.text, fontSize: 17, fontWeight: "700", color: c.onSurface },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  price: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: "45%" },
}));
