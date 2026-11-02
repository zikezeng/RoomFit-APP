import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Card, Notice, Stepper, money } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, uid } from "@/src/lib/apartment";
import { CATEGORIES, categoriesFor } from "@/src/lib/catalog";
import { CategoryId, Need, Product, RoomKind } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Keep Step 4's recommendations local to this page.
const ESSENTIALS: Partial<Record<RoomKind, CategoryId[]>> = {
  living: ["sofa", "coffee_table", "tv_stand", "floor_lamp"],
  bedroom: ["bed_frame", "nightstand", "desk", "floor_lamp"],
};

const normalizeName = (name: string) =>
  name.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");

const matchesName = (name: string, c: typeof CATEGORIES[number]) =>
  [
    c.id,
    c.label,
    ...c.label.split("/").map((s) => s.trim()),
    ...(c.id === "bookshelf" ? ["bookcase"] : []),
  ].some((label) => normalizeName(label) === normalizeName(name));

export default function FurnitureStep() {
  const router = useRouter();
  const { state, ready, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();

  const room = state.apartment.rooms.find(
    (r) => r.id === state.selectedRoomId
  );
  const kind = room?.kind ?? "living";

  const cats = useMemo(
    () =>
      room
        ? categoriesFor(kind).filter(
            (c) =>
              kind !== "living" ||
              !["bed_frame", "mattress", "nightstand", "wardrobe"].includes(
                c.id
              )
          )
        : [],
    [kind, room]
  );

  const essentials = ESSENTIALS[kind]
    ? ESSENTIALS[kind]!.flatMap((id) => cats.filter((c) => c.id === id))
    : cats.filter((c) => c.rooms[kind] === "essential");

  const isEssential = (id: CategoryId) =>
    essentials.some((c) => c.id === id);

  // Remove stale, hidden room-specific needs before layout generation.
  useEffect(() => {
    if (!ready || !room) return;

    const allowed = new Set(cats.map((c) => c.id));
    const next = Object.fromEntries(
      Object.entries(state.needs)
        .filter(([id]) => allowed.has(id as CategoryId))
        .map(([id, need]) => [
          id,
          {
            ...need,
            priority:
              (ESSENTIALS[kind]?.includes(id as CategoryId) ??
              cats.find((c) => c.id === id)?.rooms[kind] === "essential")
                ? "essential"
                : "optional",
          },
        ])
    );

    if (JSON.stringify(next) !== JSON.stringify(state.needs)) {
      update({ needs: next }, "all");
    }
  }, [ready, room, kind, cats, state.needs, update]);

  const needs = state.needs;
  const [form, setForm] = useState({
    name: "",
    w: "",
    d: "",
    price: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const set = (id: CategoryId, patch: Partial<Need>) =>
    update(
      {
        needs: {
          ...needs,
          [id]: {
            ...(needs[id] ?? {
              qty: 0,
              priority: isEssential(id) ? "essential" : "optional",
            }),
            ...patch,
          },
        },
      },
      "all"
    );

  const selected = cats.filter((c) => (needs[c.id]?.qty ?? 0) > 0);
  const optional = selected.filter((c) => !isEssential(c.id));
  const count =
    selected.reduce((a, c) => a + needs[c.id]!.qty, 0) +
    state.customItems.length;

  const addCustom = () => {
    if (!room) {
      return setErr("Choose a room before adding furniture.");
    }

    const name = form.name.trim();
    if (!name) {
      return setErr("Give your item a name.");
    }

    const category = cats.find((c) => matchesName(name, c));

    if (category) {
      const qty = needs[category.id]?.qty ?? 0;

      if (qty >= category.maxQty) {
        return setErr(
          `You can add up to ${category.maxQty} × ${category.label}.`
        );
      }

      set(category.id, {
        qty: qty + 1,
        priority: isEssential(category.id) ? "essential" : "optional",
      });
      setForm({ name: "", w: "", d: "", price: "" });
      setErr(null);
      return;
    }

    if (CATEGORIES.some((c) => matchesName(name, c))) {
      return setErr("This furniture belongs to a different room type.");
    }

    const w = Number(form.w);
    const d = Number(form.d);
    const price = Number(form.price || "0");

    if (!(w >= 10 && w <= 400 && d >= 10 && d <= 400)) {
      return setErr("Width and depth must be between 10 and 400 cm.");
    }

    if (!(price >= 0 && price <= 20000)) {
      return setErr("Price must be between $0 and $20,000.");
    }

    const p: Product = {
      id: `custom-${uid()}`,
      name: form.name.trim(),
      category: "custom",
      width: w,
      depth: d,
      height: 80,
      price,
      styles: [],
      mood: "warm",
      retailer: "Your own item",
      url: null,
      description:
        "Custom item you added. Placed along a free wall and checked like every other piece.",
    };

    update({ customItems: [...state.customItems, p] }, "all");
    setForm({ name: "", w: "", d: "", price: "" });
    setErr(null);
  };

  const section = () => {
    const list = essentials;

    return (
      <View style={{ gap: spacing.md }}>
        <Text style={s.h}>Essentials</Text>

        {list.map((c) => {
          const n = needs[c.id] ?? {
            qty: 0,
            priority: "essential" as const,
          };
          const on = n.qty > 0;

          return (
            <View key={c.id} style={[s.item, on && s.itemOn]}>
              <Pressable
                testID={`furniture-card-${c.id}`}
                onPress={() => set(c.id, { qty: on ? 0 : 1 })}
                style={s.main}
              >
                <ProductSwatch category={c.id} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name}>{c.label}</Text>
                  <Text style={s.p}>{c.hint}</Text>
                </View>
              </Pressable>

              {on && c.maxQty > 1 ? (
                <Stepper
                  value={n.qty}
                  min={0}
                  max={c.maxQty}
                  onChange={(v) => set(c.id, { qty: v })}
                  testID={`qty-${c.id}`}
                />
              ) : (
                <Pressable
                  testID={`furniture-toggle-${c.id}`}
                  onPress={() => set(c.id, { qty: on ? 0 : 1 })}
                  style={[s.check, on && s.checkOn]}
                >
                  <Text
                    style={[
                      s.checkText,
                      on && { color: colors.onBrandPrimary },
                    ]}
                  >
                    {on ? "✓" : "+"}
                  </Text>
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
      cta={{
        label: `Continue with ${count} items`,
        disabled: !ready || !room || count === 0,
        onPress: () => router.push("/plan/style"),
        testID: "furniture-continue-button",
      }}
    >
      {!room ? (
        <Notice
          tone="warning"
          text="No room selected — go back and choose a room to furnish."
        />
      ) : null}

      <Card testID="furniture-summary">
        <Text style={s.name}>Your selection</Text>
        <Text style={s.p} testID="furniture-summary-text">
          {count
            ? [
                ...selected.map(
                  (c) => `${needs[c.id]!.qty}× ${c.label}`
                ),
                ...state.customItems.map((p) => `1× ${p.name}`),
              ].join(" · ")
            : "Nothing selected yet."}
        </Text>
      </Card>

      {section()}

      <Card style={{ gap: spacing.md }} testID="custom-item-card">
        <Text style={s.h}>Optional</Text>
        <Text style={s.p}>
          Type another furniture item and tap Add item. Add as many
          different items as you need. For items outside our catalog,
          enter their width and depth so we can check the fit.
        </Text>

        <TextInput
          testID="custom-name-input"
          style={s.input}
          placeholder="Item name (e.g. Piano)"
          placeholderTextColor={colors.muted}
          value={form.name}
          onChangeText={(t) => setForm({ ...form, name: t })}
        />

        <View style={s.row}>
          <TextInput
            testID="custom-width-input"
            style={[s.input, { flex: 1 }]}
            placeholder="Width cm"
            keyboardType="number-pad"
            placeholderTextColor={colors.muted}
            value={form.w}
            onChangeText={(t) => setForm({ ...form, w: t })}
          />
          <TextInput
            testID="custom-depth-input"
            style={[s.input, { flex: 1 }]}
            placeholder="Depth cm"
            keyboardType="number-pad"
            placeholderTextColor={colors.muted}
            value={form.d}
            onChangeText={(t) => setForm({ ...form, d: t })}
          />
          <TextInput
            testID="custom-price-input"
            style={[s.input, { flex: 1 }]}
            placeholder="Price $"
            keyboardType="number-pad"
            placeholderTextColor={colors.muted}
            value={form.price}
            onChangeText={(t) => setForm({ ...form, price: t })}
          />
        </View>

        {err ? (
          <Notice
            tone="error"
            text={err}
            testID="custom-item-error"
          />
        ) : null}

        <Button
          small
          label="Add item"
          icon="plus"
          onPress={addCustom}
          testID="add-custom-item-button"
        />

        {optional.map((c) => (
          <View
            key={c.id}
            style={s.row}
            testID={`optional-item-${c.id}`}
          >
            <Text style={[s.p, { flex: 1 }]}>
              {needs[c.id]!.qty}× {c.label}
            </Text>
            <Button
              small
              kind="ghost"
              label="Remove"
              onPress={() => set(c.id, { qty: 0 })}
              testID={`remove-optional-${c.id}`}
            />
          </View>
        ))}

        {state.customItems.map((p) => (
          <View
            key={p.id}
            style={s.row}
            testID={`custom-item-${p.id}`}
          >
            <Text style={[s.p, { flex: 1 }]}>
              {p.name} · {p.width}×{p.depth} cm · {money(p.price)}
            </Text>
            <Button
              small
              kind="ghost"
              label="Remove"
              onPress={() =>
                update(
                  {
                    customItems: state.customItems.filter(
                      (x) => x.id !== p.id
                    ),
                  },
                  "all"
                )
              }
              testID={`remove-custom-${p.id}`}
            />
          </View>
        ))}
      </Card>
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  h: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: c.onSurface,
  },
  p: {
    fontFamily: fonts.text,
    fontSize: 13,
    lineHeight: 19,
    color: c.muted,
  },
  name: {
    fontFamily: fonts.text,
    fontSize: 16,
    fontWeight: "700",
    color: c.onSurface,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  itemOn: {
    borderColor: c.brandPrimary,
    backgroundColor: c.brandTertiary,
  },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: c.brandPrimary,
    borderColor: c.brandPrimary,
  },
  checkText: {
    fontFamily: fonts.text,
    fontSize: 16,
    fontWeight: "700",
    color: c.onSurfaceTertiary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.text,
    fontSize: 15,
    color: c.onSurface,
  },
}));
