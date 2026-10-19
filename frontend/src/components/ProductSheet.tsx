import Feather from "@react-native-vector-icons/feather";
import React, { useMemo, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Notice, money } from "@/src/components/ui";
import { CATEGORY_MAP, PRODUCT_MAP, STYLE_LABEL } from "@/src/lib/catalog";
import { alternativesFor } from "@/src/lib/solver";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function ProductSheet({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const { state, swap } = usePlan();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const item = state.plan?.find((i) => i.uid === uid);
  const p = item ? PRODUCT_MAP[item.productId] : null;
  const alts = useMemo(
    () => (item && state.plan ? alternativesFor(state.room, state.plan, item.uid, state.budget, { styles: state.styles, moods: state.moods }) : []),
    [item, state.plan, state.room, state.budget, state.styles, state.moods],
  );

  const doSwap = (pid: string) => {
    if (!item || !p) return;
    const np = PRODUCT_MAP[pid];
    const r = swap(item.uid, pid);
    if (r.valid) {
      const d = np.price - p.price;
      setMsg({ tone: "success", text: `Swapped to ${np.name}. Layout re-checked: all constraints pass. Total ${d <= 0 ? "decreased" : "increased"} by ${money(Math.abs(d))}.` });
    } else {
      const fails = r.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ");
      setMsg({ tone: "error", text: `${np.name} can't replace this piece: ${fails} Choose one of the options marked "Fits".` });
    }
  };

  return (
    <Modal visible={!!uid} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} testID="product-sheet-backdrop" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="product-sheet">
        <View style={s.handle} />
        {p && item ? (
          <ScrollView contentContainerStyle={{ gap: spacing.lg }} showsVerticalScrollIndicator={false}>
            <View style={s.headRow}>
              <ProductSwatch category={p.category} style={p.styles[0]} size={96} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.cat}>{CATEGORY_MAP[p.category].label}</Text>
                <Text style={s.name} testID="product-sheet-name">
                  {p.name}
                </Text>
                <Text style={s.price} testID="product-sheet-price">
                  {money(p.price)}
                </Text>
              </View>
              <Pressable onPress={onClose} testID="product-sheet-close" hitSlop={10} style={s.close}>
                <Feather name="x" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
            <View style={s.specs}>
              {[
                ["Width", p.width],
                ["Depth", p.depth],
                ["Height", p.height],
              ].map(([k, v]) => (
                <View key={k} style={s.spec}>
                  <Text style={s.specK}>{k}</Text>
                  <Text style={s.specV} testID={`product-sheet-${String(k).toLowerCase()}`}>
                    {v} cm
                  </Text>
                </View>
              ))}
            </View>
            <View style={s.tags}>
              {p.styles.map((st) => (
                <Text key={st} style={s.tag}>
                  {STYLE_LABEL[st]}
                </Text>
              ))}
              <Text style={s.tag}>{p.mood}</Text>
            </View>
            <Text style={s.desc}>{p.description}</Text>
            <View style={s.retail}>
              <Feather name="shopping-bag" size={16} color={colors.muted} />
              <Text style={s.desc} testID="product-sheet-retailer">
                {p.retailer}
              </Text>
            </View>
            {p.url ? (
              <Button kind="secondary" small label="View at retailer" icon="external-link" onPress={() => Linking.openURL(p.url!)} testID="product-sheet-link" />
            ) : (
              <Text style={s.caption}>No verified retailer link — demo catalog product.</Text>
            )}
            {msg ? <Notice tone={msg.tone} text={msg.text} testID="swap-result-message" /> : null}
            <Text style={s.section}>Alternatives</Text>
            <Text style={s.caption}>Ranked by style tags among options that fit your room, door clearance, walkways and budget.</Text>
            {alts.map((a) => (
              <View key={a.product.id} style={[s.alt, !a.ok && { opacity: 0.6 }]} testID={`alt-${a.product.id}`}>
                <ProductSwatch category={a.product.category} style={a.product.styles[0]} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.altName}>{a.product.name}</Text>
                  <Text style={s.caption}>
                    {a.product.width}×{a.product.depth}×{a.product.height} cm · {STYLE_LABEL[a.product.styles[0]]}
                  </Text>
                  <Text style={[s.caption, { color: a.delta <= 0 ? colors.success : colors.warning, fontWeight: "600" }]}>
                    {money(a.product.price)} ({a.delta <= 0 ? "−" : "+"}
                    {money(Math.abs(a.delta))})
                  </Text>
                  <Text style={[s.caption, { color: a.ok ? colors.success : colors.error }]} numberOfLines={2}>
                    {a.ok ? "Fits — all checks pass" : a.reason}
                  </Text>
                </View>
                <Button small kind={a.ok ? "primary" : "secondary"} label="Swap" onPress={() => doSwap(a.product.id)} testID={`swap-btn-${a.product.id}`} />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { maxHeight: "82%", backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  headRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  cat: { fontFamily: fonts.text, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 1 },
  name: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  price: { fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.brandPrimary },
  specs: { flexDirection: "row", gap: spacing.sm },
  spec: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  specK: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  specV: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tag: { fontFamily: fonts.text, fontSize: 12, color: c.onBrandTertiary, backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, overflow: "hidden", textTransform: "capitalize" },
  desc: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurfaceTertiary },
  retail: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  caption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  section: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  alt: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  altName: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
}));
