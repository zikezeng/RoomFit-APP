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
import { budgetNote, shoppingTotals } from "@/src/lib/shopping-totals";
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
  // Same money rules as Step 8: real choices and the user's own items count; unchosen positions count as $0.
  const totals = shoppingTotals(entries.map((e, i) => ({ item: e.item, real: realSelections[i] })));
  const total = totals.spent;
  const lines = totals.lines;
  const nameOf = (i: number) => (lines[i].status === "real" ? realSelections[i]!.title : lines[i].status === "custom" ? products[i].name : `${CATEGORY_MAP[products[i].category].label} — not chosen yet`);
  const priceOf = (i: number) => {
    const real = realSelections[i];
    const line = lines[i];
    if (line.status === "unchosen") return "—";
    if (line.price === null) return "See price";
    return real?.price_text ?? money(line.price);
  };
  const budget = resultRooms.reduce((sum, id) => sum + (id === state.selectedRoomId ? state.budget : state.roomProgress[id]?.budget ?? 0), 0);
  const remaining = budget - total;
  const note = budgetNote(totals, budget, money);
  // Room checks come from the layout; the budget check uses the real prices above.
  const roomFails = v ? v.checks.filter((c) => !c.ok && c.id !== "budget") : [];
  const allOk = roomFails.length === 0 && remaining >= 0;
  const validityText = allOk
    ? `Validated placement: inside walls, no overlaps, door clear, walkways clear. ${money(total)} of ${money(budget)} used.`
    : [...roomFails.map((c) => c.detail), remaining < 0 ? `Over budget by ${money(-remaining)}.` : null].filter(Boolean).join(" ");

  const csv = () => {
    const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    const rows = [["Room", "Category", "Name", "Price (USD)", "Retailer", "Link", "Space in layout"]];
    products.forEach((p, i) => {
      const real = realSelections[i];
      const line = lines[i];
      rows.push([
        entries[i].room,
        CATEGORY_MAP[p.category].label,
        nameOf(i),
        line.price === null ? "" : String(line.price),
        line.status === "real" ? real!.retailer : line.status === "custom" ? "Your own item" : "",
        real?.url ?? "",
        `${p.width}×${p.depth}×${p.height} cm`,
      ]);
    });
    rows.push(["", "", "TOTAL (chosen items)", String(total), "", "", ""], ["", "", "BUDGET", String(budget), "", "", ""], ["", "", "REMAINING", String(Math.round((budget - total) * 100) / 100), "", "", ""]);
    if (totals.toChoose) rows.push(["", "", `${totals.toChoose} not chosen yet (not in total)`, "", "", "", ""]);
    if (totals.unpriced) rows.push(["", "", `${totals.unpriced} chosen without a listed price (not in total)`, "", "", "", ""]);
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
    else await Share.share({ message: `My RoomFit plan (${geom?.label})\n` + products.map((_, i) => `• ${nameOf(i)} — ${priceOf(i)}`).join("\n") + `\nChosen so far ${money(total)} of ${money(budget)}${note ? `\n${note}` : ""}` });
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
        <Notice tone={allOk ? "success" : "error"} text={validityText} testID="results-validity" />
      </Card>
      <Card style={{ gap: spacing.md }} testID="budget-summary">
        <Text style={s.h}>Budget summary</Text>
        <View style={s.stats}>
          {[
            ["Budget", budget, "summary-budget"],
            ["Chosen so far", total, "summary-total"],
            [remaining >= 0 ? "Remaining" : "Over budget", Math.abs(remaining), "summary-remaining"],
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
        <Text style={s.k} testID="summary-note">
          {note}
        </Text>
      </Card>
      <Text style={s.h}>Shopping list</Text>
      {products.map((p, i) => {
        const real = realSelections[i];
        const line = lines[i];
        const inCurrentRoom = entries[i].roomId === state.selectedRoomId;
        const space = `${p.width}×${p.depth} cm`;
        return (
          <Card key={`${entries[i].room}-${resultItems[i].uid}`} style={s.item} testID={`list-item-${resultItems[i].uid}`}>
            {real?.image ? (
              <Image source={{ uri: real.image }} style={s.realThumb} contentFit="cover" transition={120} />
            ) : (
              <ProductSwatch category={p.category} style={p.styles[0]} size={56} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name} numberOfLines={2}>
                {line.status === "real" ? real!.title : line.status === "custom" ? p.name : CATEGORY_MAP[p.category].label}
              </Text>
              <Text style={s.k}>
                {line.status === "real" ? real!.retailer : line.status === "custom" ? `Your own item · ${p.width}×${p.depth}×${p.height} cm` : "Not chosen yet · not in total"}
              </Text>
              {line.status !== "custom" ? <Text style={s.k}>Space in layout: {space}</Text> : null}
            </View>
            <View style={s.priceBlock}>
              <Text style={s.price} testID={`list-item-price-${resultItems[i].uid}`}>
                {priceOf(i)}
              </Text>
              {real?.url ? (
                <Button small kind="ghost" label="View product" icon="external-link" onPress={() => Linking.openURL(real.url)} testID={`result-product-link-${i}`} />
              ) : line.status === "unchosen" && inCurrentRoom ? (
                <Button small kind="secondary" label="Choose" icon="shopping-bag" onPress={() => setUid(resultItems[i].uid)} testID={`result-choose-${resultItems[i].uid}`} />
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
