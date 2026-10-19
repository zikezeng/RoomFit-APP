import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Card, Notice, Stepper, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, uid } from "@/src/lib/apartment";
import { categoriesFor } from "@/src/lib/catalog";
import { CategoryId, Need, Product } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function FurnitureStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const kind = state.roomKind ?? "living";
  const room = state.roomKind ? { label: KIND_LABEL[state.roomKind] } : null;
  const cats = categoriesFor(kind);
  const needs = state.needs;
  const [form, setForm] = useState({ name: "", w: "", d: "", price: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (id: CategoryId, patch: Partial<Need>) => update({ needs: { ...needs, [id]: { ...(needs[id] ?? { qty: 0, priority: "optional" }), ...patch } } }, "all");
  const selected = cats.filter((c) => (needs[c.id]?.qty ?? 0) > 0);
  const count = selected.reduce((a, c) => a + needs[c.id]!.qty, 0) + state.customItems.length;

  const addCustom = () => {
    const w = parseFloat(form.w);
    const d = parseFloat(form.d);
    const price = parseFloat(form.price || "0");
    if (!form.name.trim()) return setErr("Give your item a name.");
    if (!(w >= 10 && w <= 400 && d >= 10 && d <= 400)) return setErr("Width and depth must be between 10 and 400 cm.");
    if (!(price >= 0 && price <= 20000)) return setErr("Price must be between $0 and $20,000.");
    const p: Product = { id: `custom-${uid()}`, name: form.name.trim(), category: "custom", width: w, depth: d, height: 80, price, styles: [], mood: "warm", retailer: "Your own item", url: null, description: "Custom item you added. Placed along a free wall and checked like every other piece." };
    update({ customItems: [...state.customItems, p] }, "all");
    setForm({ name: "", w: "", d: "", price: "" });
    setErr(null);
  };

  const section = (title: string, prio: "essential" | "optional") => {
    const list = cats.filter((c) => (needs[c.id]?.priority ?? c.rooms[kind]) === prio);
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={s.h}>{title}</Text>
        {list.map((c) => {
          const n = needs[c.id] ?? { qty: 0, priority: prio };
          const on = n.qty > 0;
          return (
            <View key={c.id} style={[s.item, on && s.itemOn]}>
              <Pressable testID={`furniture-card-${c.id}`} onPress={() => set(c.id, { qty: on ? 0 : 1 })} style={s.main}>
                <ProductSwatch category={c.id} size={52} />
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
      step={4}
      title="What Does Your Room Need?"
      subtitle={`${room?.label ?? "Room"} (${KIND_LABEL[kind]}) · tap to add or remove. You don't need everything.`}
      cta={{ label: `Continue with ${count} items`, disabled: count === 0, onPress: () => router.push("/plan/style"), testID: "furniture-continue-button" }}
    >
      {!room ? <Notice tone="warning" text="No room selected — go back and choose a room to furnish." /> : null}
      <Card testID="furniture-summary">
        <Text style={s.name}>Your selection</Text>
        <Text style={s.p} testID="furniture-summary-text">
          {count ? [...selected.map((c) => `${needs[c.id]!.qty}× ${c.label}`), ...state.customItems.map((p) => `1× ${p.name}`)].join(" · ") : "Nothing selected yet."}
        </Text>
      </Card>
      {section("Essential", "essential")}
      {section("Optional", "optional")}
      <Card style={{ gap: spacing.md }} testID="custom-item-card">
        <Text style={s.h}>Add your own item</Text>
        <Text style={s.p}>Something not listed? Enter its real size — it will be placed and checked like any other piece.</Text>
        <TextInput testID="custom-name-input" style={s.input} placeholder="Item name (e.g. Piano)" placeholderTextColor={colors.muted} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
        <View style={s.row}>
          <TextInput testID="custom-width-input" style={[s.input, { flex: 1 }]} placeholder="Width cm" keyboardType="number-pad" placeholderTextColor={colors.muted} value={form.w} onChangeText={(t) => setForm({ ...form, w: t })} />
          <TextInput testID="custom-depth-input" style={[s.input, { flex: 1 }]} placeholder="Depth cm" keyboardType="number-pad" placeholderTextColor={colors.muted} value={form.d} onChangeText={(t) => setForm({ ...form, d: t })} />
          <TextInput testID="custom-price-input" style={[s.input, { flex: 1 }]} placeholder="Price $" keyboardType="number-pad" placeholderTextColor={colors.muted} value={form.price} onChangeText={(t) => setForm({ ...form, price: t })} />
        </View>
        {err ? <Notice tone="error" text={err} testID="custom-item-error" /> : null}
        <Button small label="Add item" icon="plus" onPress={addCustom} testID="add-custom-item-button" />
        {state.customItems.map((p) => (
          <View key={p.id} style={s.row} testID={`custom-item-${p.id}`}>
            <Text style={[s.p, { flex: 1 }]}>
              {p.name} · {p.width}×{p.depth} cm · {money(p.price)}
            </Text>
            <Button small kind="ghost" label="Remove" onPress={() => update({ customItems: state.customItems.filter((x) => x.id !== p.id) }, "all")} testID={`remove-custom-${p.id}`} />
          </View>
        ))}
      </Card>
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
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  itemOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  check: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  checkText: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurfaceTertiary },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: spacing.md, fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
}));
