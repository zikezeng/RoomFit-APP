import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Linking, Switch, Text, View } from "react-native";

import { catFill } from "@/src/components/FloorPlan";
import { Furnished3DHandle, Furnished3DView, Scene3DViewName } from "@/src/components/Furnished3DView";
import { ProductSheet } from "@/src/components/ProductSheet";
import { ProductSwatch } from "@/src/components/ProductSwatch";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { getProduct } from "@/src/lib/catalog";
import { WHOLE_HOME, buildHomeScene, buildRoomScene, furnishedRoomIds, Scene3DColors } from "@/src/lib/furnished3d";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Step 9 · furnished 3D preview of the chosen layout with the products picked in Step 8. */
export default function Preview3DStep() {
  const router = useRouter();
  const { state } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const viewer = useRef<Furnished3DHandle>(null);
  const [roomChoice, setRoomChoice] = useState<string | null>(null);
  const [view, setView] = useState<Scene3DViewName>("default");
  const [labels, setLabels] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [sheetUid, setSheetUid] = useState<string | null>(null);

  const roomIds = furnishedRoomIds(state);
  const fallbackRoom = state.selectedRoomId && roomIds.includes(state.selectedRoomId) ? state.selectedRoomId : roomIds[0] ?? null;
  const showing = roomChoice === WHOLE_HOME || (roomChoice && roomIds.includes(roomChoice)) ? roomChoice : fallbackRoom;
  const canShowHome = state.apartment.rooms.length > 1;

  const palette: Scene3DColors = {
    floor: { living: colors.wood, bedroom: colors.wood, dining: colors.wood, hallway: colors.wood, closet: colors.wood, other: colors.wood, kitchen: colors.surfaceTertiary, bathroom: colors.surfaceTertiary, balcony: colors.borderStrong },
    item: (c) => catFill(colors, c),
  };
  const scene = showing === WHOLE_HOME ? buildHomeScene(state, palette) : showing ? buildRoomScene(state, showing, palette) : null;

  const item = scene?.items.find((i) => i.uid === uid) ?? null;
  const chosen = scene ? scene.items.filter((i) => i.status === "real").length : 0;
  const open = scene ? scene.items.filter((i) => i.status === "unchosen").length : 0;
  const pickRoom = (id: string) => {
    setRoomChoice(id);
    setUid(null);
    setView("default");
  };
  const pickView = (v: Scene3DViewName) => {
    setView(v);
    viewer.current?.setView(v);
  };

  if (!scene || !showing) {
    return (
      <WizardScaffold step={9} title="Your Room in 3D">
        <Notice tone="warning" text="No layout selected yet. Choose a layout to see your room in 3D." testID="preview3d-no-plan" />
        <Button label="Go to layouts" onPress={() => router.replace("/plan/layouts")} testID="preview3d-go-layouts" />
      </WizardScaffold>
    );
  }

  const proxy = item ? getProduct(state.plan?.find((p) => p.uid === item.uid)?.productId ?? "") : null;
  const editable = !!item && item.roomId === state.selectedRoomId && item.status !== "custom";

  return (
    <WizardScaffold
      step={9}
      title="Your Room in 3D"
      subtitle="Drag to rotate, pinch or scroll to zoom. Tap a piece to see the product you chose for it."
      cta={{ label: "Back to shopping list", icon: "list", onPress: () => router.navigate("/plan/results"), testID: "preview3d-continue-button" }}
    >
      {roomIds.length > 1 || canShowHome ? (
        <View style={s.wrap} testID="preview3d-rooms">
          {roomIds.map((id) => (
            <Chip key={id} label={state.apartment.rooms.find((r) => r.id === id)?.label ?? "Room"} selected={showing === id} onPress={() => pickRoom(id)} testID={`preview3d-room-${id}`} />
          ))}
          {canShowHome ? <Chip label="Whole home" selected={showing === WHOLE_HOME} onPress={() => pickRoom(WHOLE_HOME)} testID="preview3d-room-home" /> : null}
        </View>
      ) : null}

      <View style={s.viewer} testID="preview3d-viewer-box">
        <Furnished3DView ref={viewer} scene={scene} selectedUid={uid} showLabels={labels} onSelect={setUid} style={{ flex: 1 }} testID="preview3d-viewer" />
      </View>

      <View style={s.controls}>
        <View style={s.wrap}>
          <Chip label="3D view" selected={view === "default"} onPress={() => pickView("default")} testID="preview3d-view-default" />
          <Chip label="Top view" selected={view === "top"} onPress={() => pickView("top")} testID="preview3d-view-top" />
        </View>
        <View style={s.row}>
          <Text style={s.k}>Names</Text>
          <Switch value={labels} onValueChange={setLabels} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} testID="preview3d-labels-switch" />
        </View>
      </View>

      {item ? (
        <Card style={s.item} testID="preview3d-item-card">
          {item.image ? <Image source={{ uri: item.image }} style={s.thumb} contentFit="cover" transition={120} /> : <ProductSwatch category={item.category} style={proxy?.styles[0]} size={64} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.slot}>{item.label}</Text>
            <Text style={s.name} numberOfLines={2} testID="preview3d-item-name">
              {item.status === "unchosen" ? "Not chosen yet" : item.title}
            </Text>
            <Text style={s.k} testID="preview3d-item-detail">
              {[item.retailer, item.priceText].filter(Boolean).join(" · ") || `Space in layout ${item.spaceW}×${item.spaceD} cm`}
            </Text>
            {item.status === "real" ? (
              <Text style={[s.k, item.fit === "warn" && { color: colors.error }, item.fit === "ok" && { color: colors.success }]} testID="preview3d-item-size">
                Real size: {item.sizeText}. {item.fitText}
              </Text>
            ) : null}
            <View style={s.wrap}>
              {item.url ? <Button small kind="ghost" label="View product" icon="external-link" onPress={() => Linking.openURL(item.url!)} testID="preview3d-item-link" /> : null}
              {editable ? (
                <Button small kind={item.status === "unchosen" ? "primary" : "secondary"} label={item.status === "unchosen" ? "Choose" : "Change"} icon="shopping-bag" onPress={() => setSheetUid(item.uid)} testID="preview3d-item-choose" />
              ) : null}
            </View>
          </View>
        </Card>
      ) : (
        <View style={s.hint}>
          <Feather name="mouse-pointer" size={14} color={colors.muted} />
          <Text style={s.k} testID="preview3d-summary">
            {scene.items.length} pieces · {chosen} with a real product chosen{open ? ` · ${open} not chosen yet` : ""}. Tap one to see it.
          </Text>
        </View>
      )}

      <Notice
        text="Each piece is a simplified 3D shape at its place in your layout. Once you choose a real product, the shape takes that product's colour and, when the shop lists it, its real size. Shops do not provide 3D models, so the product's photo and name are shown on its label."
        testID="preview3d-note"
      />
      <ProductSheet uid={sheetUid} onClose={() => setSheetUid(null)} />
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  viewer: { height: 420, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  k: { flex: 1, fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  item: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  slot: { fontFamily: fonts.text, fontSize: 11, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
}));
