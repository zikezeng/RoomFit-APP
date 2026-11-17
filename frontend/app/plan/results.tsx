import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Platform, Share, Text, View } from "react-native";

import { CombinedPlan } from "@/src/components/CombinedPlan";
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
  const { state, geom, reset, nextRoom } = usePlan();
  const s = useStyles();
  const [uid, setUid] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const plan = state.plan;
  const v = plan && geom ? validateLayout(geom, plan, state.budget) : null;
  const hasNext = state.selectedRoomIds.indexOf(state.selectedRoomId ?? "") < state.selectedRoomIds.length - 1;
  const allComplete = !!plan && state.selectedRoomIds.every(id => id === state.selectedRoomId || !!state.roomProgress[id]?.plan);
  const final = !hasNext && allComplete;
  const resultRooms = final ? state.selectedRoomIds : [state.selectedRoomId!];
  const entries = resultRooms.flatMap(id =>
    (id === state.selectedRoomId ? plan ?? [] : state.roomProgress[id]?.plan ?? []).map(item => ({
      item,
      roomId: id,
      room: state.apartment.rooms.find(r => r.id === id)?.label ?? id,
    })),
  );
  const resultItems = entries.map(e => e.item);
  const products = resultItems.map(i => getProduct(i.productId));
  const realSelections = entries.map(e =>
    (e.roomId === state.selectedRoomId ? state.realSelections : state.roomProgress[e.roomId]?.realSelections ?? {})[e.item.uid],
  );
  const total = products.reduce((sum, p, i) => sum + (realSelections[i]?.price ?? p.price), 0);
  const budget = resultRooms.reduce((sum, id) => sum + (id === state.selectedRoomId ? state.budget : state.roomProgress[id]?.budget ?? 0), 0);

  const csv = () => {
    const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    const rows = [["Room", "Category", "Name", "Price (USD)", "Retailer", "Link", "Layout proxy size"]];
    products.forEach((p, i) => {
      const real = realSelections[i];
      rows.push([
        entries[i].room,
        CATEGORY_MAP[p.category].label,
        real?.title ?? p.name,
        String(real?.price ?? p.price),
        real?.retailer ?? p.retailer,
        real?.url ?? p.url ?? "Not verified (demo)",
        `${p.width}×${p.depth}×${p.height} cm`,
      ]);
    });
    rows.push(["", "", "TOTAL", "", "", "", String(total), "", ""], ["", "", "BUDGET", "", "", "", String(budget), "", ""]);
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
    else await Share.share({ message: `My RoomFit plan (${geom?.label})\n` + products.map((p, i) => {
      const real = realSelections[i];
      return `• ${real?.title ?? p.name} — ${money(real?.price ?? p.price)}`;
    }).join("\n") + `\nTotal ${money(total)} of ${money(budget)}` });
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
    <WizardScaffold step={9} title="Your RoomFit Plan Is Ready!" subtitle={`${geom.label} · ${fmtLen(geom.width, geom.unit)} × ${fmtLen(geom.length, geom.unit)} · ${fmtAreaCm2(geom.area, geom.unit)}`} cta={hasNext ? { label: "Next Room", testID: "next-room-button", onPress: () => { nextRoom(); setUid(null); setMsg(null); router.push("/plan/furniture"); } } : undefined}>
      <Card style={{ gap: spacing.sm }}>
        {state.selectedRoomIds.length > 1 ? <CombinedPlan onPressItem={setUid} /> : <FloorPlan geom={geom} items={plan} selectedUid={uid} onPressItem={setUid} testID="results-floorplan-svg" />}
        <Notice tone={v.valid ? "success" : "error"} text={v.valid ? "Validated placement: inside walls, no overlaps, door clear, walkways clear, within budget." : v.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ")} testID="results-validity" />
      </Card>
      <Card style={{ gap: spacing.md }} testID="budget-summary">
        <Text style={s.h}>Budget summary</Text>
        <View style={s.stats}>
          {[
            ["Budget", budget, "summary-budget"],
            ["Furniture", total, "summary-total"],
            ["Remaining", budget - total, "summary-remaining"],
          ].map(([k, n, id]) => (
            <View key={k as string} style={s.stat}>
              <Text style={s.k}>{k}</Text>
              <Text style={s.v} testID={id as string}>
                {money(n as number)}
              </Text>
            </View>
          ))}
        </View>
        <BudgetBar total={total} budget={budget} />
      </Card>
      <Text style={s.h}>Shopping list</Text>
      {products.map((p, i) => {
        const real = realSelections[i];
        return (
          <Card key={`${entries[i].room}-${resultItems[i].uid}`} style={s.item} testID={`list-item-${resultItems[i].uid}`}>
            {real?.image ? (
              <Image source={{ uri: real.image }} style={s.realThumb} contentFit="cover" transition={120} />
            ) : (
              <ProductSwatch category={p.category} style={p.styles[0]} size={56} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{real?.title ?? p.name}</Text>
              <Text style={s.k}>
                {real ? `${real.retailer} · Selected real product` : `${p.width}×${p.depth}×${p.height} cm · ${p.retailer}`}
              </Text>
              {real ? <Text style={s.k}>Layout proxy: {p.width}×{p.depth}×{p.height} cm</Text> : null}
            </View>
            <View style={s.priceBlock}>
              <Text style={s.price}>{money(real?.price ?? p.price)}</Text>
              {real?.url ? (
                <Button small kind="ghost" label="View product" icon="external-link" onPress={() => Linking.openURL(real.url)} testID={`result-product-link-${i}`} />
              ) : null}
            </View>
          </Card>
        );
      })}
      {msg ? <Notice tone="success" text={msg} testID="results-message" /> : null}
      {final ? <View style={s.actions}>
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
      </View> : null}
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
  realThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  priceBlock: { alignItems: "flex-end", gap: spacing.xs },
  price: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: "45%" },
}));
