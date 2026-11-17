import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Notice, money } from "@/src/components/ui";
import { CATEGORY_MAP, STYLE_LABEL, getProduct } from "@/src/lib/catalog";
import { alternativesFor } from "@/src/lib/solver";
import { buildGeom } from "@/src/lib/apartment";
import { RealShoppingProduct, searchRealProducts } from "@/src/lib/real-products";
import { configsOf, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function ProductSheet({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const { state, swap } = usePlan();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [realProducts, setRealProducts] = useState<RealShoppingProduct[]>([]);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);
  const item = state.plan?.find((i) => i.uid === uid);
  const roomId = item?.roomId ?? state.selectedRoomId;
  const geom = buildGeom(state.apartment, roomId);
  const budget = configsOf(state)[roomId!]?.budget ?? state.budget;
  const p = item ? getProduct(item.productId) : null;
  const alts = item && state.plan && geom
    ? alternativesFor(geom, state.plan.filter((i) => (i.roomId ?? state.selectedRoomId) === roomId), item.uid, budget, { styles: state.styles, moods: state.moods })
    : [];

  useEffect(() => {
    let active = true;
    if (!p || p.category === "custom") {
      setRealProducts([]);
      setRealError(null);
      setRealLoading(false);
      return () => {
        active = false;
      };
    }

    setRealLoading(true);
    setRealError(null);
    searchRealProducts({
      category: p.category,
      styles: state.styles,
      moods: state.moods,
      referencePrice: p.price,
    })
      .then((products) => {
        if (active) setRealProducts(products);
      })
      .catch((e) => {
        if (active) {
          setRealProducts([]);
          setRealError(e instanceof Error ? e.message : "Could not load live shopping results.");
        }
      })
      .finally(() => {
        if (active) setRealLoading(false);
      });

    return () => {
      active = false;
    };
  }, [p?.id, p?.category, p?.price, state.styles.join("|"), state.moods.join("|")]);

  const doSwap = (pid: string) => {
    if (!item || !p) return;
    const np = getProduct(pid);
    const r = swap(item.uid, pid);
    if (!r) return;
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
              <Text style={s.caption}>This planning item uses verified demo dimensions. Live products you can actually shop appear below.</Text>
            )}

            <View style={s.sectionBlock}>
              <Text style={s.section}>Shop real products</Text>
              <Text style={s.caption}>
                Live U.S. shopping matches based on this furniture type, your selected style, mood and approximate price. These products are for shopping discovery only until we verify their exact dimensions.
              </Text>
              {realLoading ? <Text style={s.caption}>Searching live products…</Text> : null}
              {realError ? <Notice tone="warning" text={realError} testID="real-shopping-error" /> : null}
              {!realLoading && !realError && !realProducts.length ? (
                <Text style={s.caption}>No live shopping matches found right now.</Text>
              ) : null}
              {realProducts.map((rp, i) => (
                <View key={rp.id + i} style={s.realCard} testID={`real-product-${i}`}>
                  {rp.image ? (
                    <Image source={{ uri: rp.image }} style={s.realImage} contentFit="cover" transition={150} />
                  ) : (
                    <ProductSwatch category={p.category} style={p.styles[0]} size={72} />
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.altName} numberOfLines={2}>{rp.title}</Text>
                    <Text style={s.caption}>{rp.retailer}</Text>
                    <Text style={s.realPrice}>{rp.price_text ?? (rp.price !== null ? money(rp.price) : "See price")}</Text>
                    {rp.rating ? (
                      <Text style={s.caption}>★ {rp.rating}{rp.reviews ? ` · ${rp.reviews.toLocaleString()} reviews` : ""}</Text>
                    ) : null}
                    {rp.delivery ? <Text style={s.caption}>{rp.delivery}</Text> : null}
                  </View>
                  <Button
                    small
                    kind="secondary"
                    label={rp.direct_retailer ? "View at retailer" : "View product"}
                    icon="external-link"
                    onPress={() => Linking.openURL(rp.url)}
                    testID={`real-product-link-${i}`}
                  />
                </View>
              ))}
            </View>

            {msg ? <Notice tone={msg.tone} text={msg.text} testID="swap-result-message" /> : null}
            <Text style={s.section}>Layout-safe alternatives</Text>
            <Text style={s.caption}>Demo catalog options with known dimensions, ranked by style and re-checked against your room, door clearance, walkways and budget.</Text>
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
  sectionBlock: { gap: spacing.md },
  realCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  realImage: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  realPrice: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.brandPrimary },
  alt: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  altName: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
}));
