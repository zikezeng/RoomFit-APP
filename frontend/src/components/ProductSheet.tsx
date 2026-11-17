import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Notice, money } from "@/src/components/ui";
import { CATEGORY_MAP, STYLE_LABEL, getProduct } from "@/src/lib/catalog";
import { alternativesFor } from "@/src/lib/solver";
import { buildGeom } from "@/src/lib/apartment";
import { fitCheck, sizeText } from "@/src/lib/product-fit";
import { spotBudget } from "@/src/lib/shopping-totals";
import { LOADING_DETAILS, NO_DETAILS, RealShoppingProduct, fetchProductDetails, searchRealProducts } from "@/src/lib/real-products";
import { RealProductSelection } from "@/src/lib/types";
import { configsOf, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function ProductSheet({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const { state, swap, selectRealProduct, clearRealProduct } = usePlan();
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
  const selectedReal = uid ? state.realSelections[uid] : undefined;
  const latest = useRef(state);
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    latest.current = state;
  });
  const isCustom = p?.category === "custom";
  const roomPlan = (state.plan ?? []).filter((i) => (i.roomId ?? state.selectedRoomId) === roomId);
  // This spot's share of the money still left in the room budget — the price limit for the search.
  const spotCap = item ? spotBudget(roomPlan, state.realSelections, item.uid, budget) : null;
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
      maxPrice: spotCap,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.category, spotCap === null ? null : Math.ceil(spotCap / 10), state.styles.join("|"), state.moods.join("|")]);

  const doSwap = (pid: string) => {
    if (!item || !p) return;
    const np = getProduct(pid);
    const r = swap(item.uid, pid);
    if (!r) return;
    if (r.valid) {
      setMsg({ tone: "success", text: `This spot is now ${np.width}×${np.depth}×${np.height} cm. Layout re-checked: everything still fits. Choose a real product for the new size.` });
    } else {
      const fails = r.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ");
      setMsg({ tone: "error", text: `A ${np.width}×${np.depth} cm piece can't go here: ${fails} Choose one of the sizes marked "Fits".` });
    }
  };

  // Look a selected product up once more for its real size and colour. If that fails it stays "size unknown".
  const lookUp = (target: string, picked: RealProductSelection) => {
    if (!picked.page_token || inFlight.current.has(target)) return;
    inFlight.current.add(target);
    const stillChosen = () => {
      const cur = latest.current.realSelections[target];
      return !!cur && cur.id === picked.id && cur.url === picked.url;
    };
    fetchProductDetails(picked.page_token)
      .then((details) => stillChosen() && selectRealProduct(target, { ...picked, details }))
      .catch(() => stillChosen() && selectRealProduct(target, { ...picked, details: NO_DETAILS }))
      .finally(() => inFlight.current.delete(target));
  };

  // A lookup that never finished (app closed mid-way) is picked up again when the sheet opens.
  const pendingId = uid && selectedReal?.details?.status === "loading" ? selectedReal.id : null;
  useEffect(() => {
    if (uid && pendingId) {
      const cur = latest.current.realSelections[uid];
      if (cur) lookUp(uid, cur);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, pendingId]);

  const chooseRealProduct = (rp: RealShoppingProduct) => {
    if (!item || !p) return;
    const picked: RealProductSelection = { ...rp, category: p.category, details: rp.page_token ? LOADING_DETAILS : NO_DETAILS };
    inFlight.current.delete(item.uid);
    selectRealProduct(item.uid, picked);
    lookUp(item.uid, picked);
    setMsg({ tone: "success", text: `Selected ${rp.title} for this layout position. Its shopping details will carry into your final plan and 3D handoff.` });
  };

  const removeRealProduct = () => {
    if (!item) return;
    clearRealProduct(item.uid);
    setMsg({ tone: "success", text: "Removed the real product choice. This position is back to the layout planning item." });
  };

  return (
    <Modal visible={!!uid} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} testID="product-sheet-backdrop" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="product-sheet">
        <View style={s.handle} />
        {p && item ? (
          <ScrollView contentContainerStyle={{ gap: spacing.lg }} showsVerticalScrollIndicator={false}>
            <View style={s.headRow}>
              {selectedReal?.image ? (
                <Image source={{ uri: selectedReal.image }} style={s.headImage} contentFit="cover" transition={150} />
              ) : (
                <ProductSwatch category={p.category} style={p.styles[0]} size={96} />
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.cat}>{isCustom ? CATEGORY_MAP[p.category].label : selectedReal ? CATEGORY_MAP[p.category].label : "Choose a product"}</Text>
                <Text style={s.name} numberOfLines={3} testID="product-sheet-name">
                  {selectedReal ? selectedReal.title : isCustom ? p.name : CATEGORY_MAP[p.category].label}
                </Text>
                {selectedReal ? (
                  <Text style={s.price} testID="product-sheet-price">
                    {selectedReal.price_text ?? (selectedReal.price !== null ? money(selectedReal.price) : "See price")}
                  </Text>
                ) : isCustom ? (
                  <Text style={s.price} testID="product-sheet-price">
                    {money(p.price)}
                  </Text>
                ) : (
                  <Text style={s.caption}>Nothing chosen yet — pick a real product below.</Text>
                )}
              </View>
              <Pressable onPress={onClose} testID="product-sheet-close" hitSlop={10} style={s.close}>
                <Feather name="x" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
            {selectedReal ? (
              <>
                <View style={s.retail}>
                  <Feather name="shopping-bag" size={16} color={colors.muted} />
                  <Text style={s.desc} testID="product-sheet-retailer">
                    {selectedReal.retailer}
                  </Text>
                </View>
                <Button
                  kind="secondary"
                  small
                  label={selectedReal.direct_retailer ? "View at retailer" : "Buying options"}
                  icon="external-link"
                  onPress={() => Linking.openURL(selectedReal.url)}
                  testID="product-sheet-link"
                />
              </>
            ) : null}
            {selectedReal ? (
              <View style={s.realSize} testID="product-sheet-real-size">
                <Text style={s.specK}>Real size of this product</Text>
                <Text style={s.specV}>{sizeText(selectedReal.details)}</Text>
                {(() => {
                  const fit = fitCheck(selectedReal.details, { geom, item: item!, others: roomPlan });
                  return <Text style={[s.caption, { color: fit.level === "ok" ? colors.success : fit.level === "warn" ? colors.error : colors.muted }]} testID="product-sheet-fit">{fit.text}{fit.note ? ` ${fit.note}` : ""}</Text>;
                })()}
              </View>
            ) : null}
            <Text style={s.caption}>{isCustom ? "Size of your own item:" : "Planned spot in your layout — a starting point, not a size limit. A product fits if it is no longer than its wall and keeps the door clear:"}</Text>
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
            {isCustom ? <Text style={s.desc}>{p.description}</Text> : null}

            <View style={s.sectionBlock}>
              <Text style={s.section}>Shop real products</Text>
              <Text style={s.caption}>
                Live product data via Google Shopping, matched to this furniture type and your selected style and mood{spotCap !== null && spotCap >= 30 ? `, up to about $${Math.ceil(spotCap / 10) * 10} (this piece's share of the budget left in this room)` : ", with no price limit because this room's budget is used up"}. Use these results for shopping discovery; they are not used to change your layout until exact dimensions are verified.
              </Text>
              {realLoading ? <Text style={s.caption}>Searching live products…</Text> : null}
              {realError ? <Notice tone="warning" text={realError} testID="real-shopping-error" /> : null}
              {!realLoading && !realError && !realProducts.length ? (
                <Text style={s.caption}>No live shopping matches found right now.</Text>
              ) : null}
              {realProducts.map((rp, i) => {
                const isSelected = selectedReal?.id === rp.id && selectedReal?.url === rp.url;
                return (
                  <View key={rp.id + i} style={[s.realCard, isSelected && s.realCardSelected]} testID={`real-product-${i}`}>
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
                      {isSelected ? <Text style={s.selectedText}>✓ Selected for this layout</Text> : null}
                    </View>
                    <View style={s.realActions}>
                      <Button
                        small
                        kind={isSelected ? "primary" : "secondary"}
                        label={isSelected ? "Selected" : "Select product"}
                        icon={isSelected ? "check" : undefined}
                        onPress={() => chooseRealProduct(rp)}
                        testID={`real-product-select-${i}`}
                      />
                      <Button
                        small
                        kind="ghost"
                        label={rp.direct_retailer ? "Shop now" : "Buying options"}
                        icon="external-link"
                        onPress={() => Linking.openURL(rp.url)}
                        testID={`real-product-link-${i}`}
                      />
                    </View>
                  </View>
                );
              })}
              {selectedReal ? (
                <Button
                  small
                  kind="ghost"
                  label="Clear selected real product"
                  icon="x"
                  onPress={removeRealProduct}
                  testID="clear-real-product"
                />
              ) : null}
            </View>

            {msg ? <Notice tone={msg.tone} text={msg.text} testID="swap-result-message" /> : null}
            <Text style={s.section}>Other sizes for this spot</Text>
            <Text style={s.caption}>Need a bigger or smaller piece here? Pick another size and the layout is re-checked against your room, door clearance and walkways. Changing the size clears the product chosen for this spot.</Text>
            {alts
              .filter((a, i) => {
                const size = (x: typeof a.product) => `${x.width}x${x.depth}x${x.height}`;
                return size(a.product) !== size(p) && alts.findIndex((b) => size(b.product) === size(a.product)) === i;
              })
              .map((a) => (
              <View key={a.product.id} style={[s.alt, !a.ok && { opacity: 0.6 }]} testID={`alt-${a.product.id}`}>
                <ProductSwatch category={a.product.category} style={a.product.styles[0]} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.altName}>
                    {a.product.width}×{a.product.depth}×{a.product.height} cm
                  </Text>
                  <Text style={s.caption}>{STYLE_LABEL[a.product.styles[0]]} look</Text>
                  <Text style={[s.caption, { color: a.ok ? colors.success : colors.error }]} numberOfLines={2}>
                    {a.ok ? "Fits — all checks pass" : a.reason}
                  </Text>
                </View>
                <Button small kind={a.ok ? "primary" : "secondary"} label="Use size" onPress={() => doSwap(a.product.id)} testID={`swap-btn-${a.product.id}`} />
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
  headImage: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  cat: { fontFamily: fonts.text, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 1 },
  name: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  price: { fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.brandPrimary },
  specs: { flexDirection: "row", gap: spacing.sm },
  spec: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  realSize: { gap: 2, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  specK: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  specV: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  desc: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurfaceTertiary },
  retail: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  caption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  section: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  sectionBlock: { gap: spacing.md },
  realCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  realCardSelected: { borderColor: c.success, borderWidth: 2 },
  realImage: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  realPrice: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.brandPrimary },
  selectedText: { fontFamily: fonts.text, fontSize: 12, fontWeight: "700", color: c.success },
  realActions: { gap: spacing.xs, alignItems: "stretch" },
  alt: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  altName: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
}));
