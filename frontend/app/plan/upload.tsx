import Feather from "@react-native-vector-icons/feather";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { segmentFloorPlan } from "@/src/lib/ai";
import { HOME_TYPES, estimateScale, guessKinds } from "@/src/lib/apartment";
import { HomeType } from "@/src/lib/types";
import { emptyApartment, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UploadStep() {
  const router = useRouter();
  const { state, setApartment, loadDemo } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const [size, setSize] = useState(ap.sizeSqft ? String(ap.sizeSqft) : "");
  const [home, setHome] = useState<HomeType | null>(ap.homeType);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sqft = parseInt(size, 10);
  const infoOk = sqft >= 150 && sqft <= 10000 && !!home;

  const saveInfo = (sz: number, h: HomeType | null) =>
    setApartment((a) => {
      const autoScale = a.rooms.length && sz >= 150 ? estimateScale(a.rooms, sz) : a.autoScale;
      return { ...a, sizeSqft: sz >= 150 ? sz : null, homeType: h, autoScale };
    });

  const pick = async () => {
    setErr(null);
    if (!infoOk) return setErr("Enter the apartment size (150–10,000 sq ft) and home type first.");
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    if (a.mimeType === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")) return setErr("PDF received, but the room editor needs an image. Please export the plan page as PNG or JPG.");
    setBusy(true);
    try {
      const first = await ImageManipulator.manipulate(a.uri).renderAsync();
      const ctx = ImageManipulator.manipulate(a.uri);
      if (first.width > 1400) ctx.resize({ width: 1400 });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      const base = { ...emptyApartment(), source: "upload" as const, fileName: a.name, imageUri: `data:image/jpeg;base64,${out.base64}`, imgW: out.width, imgH: out.height, sizeSqft: sqft, homeType: home };
      let rooms = base.rooms;
      let note = "";
      try {
        const seg = await segmentFloorPlan(out.base64!);
        rooms = guessKinds(seg.rooms.map((r) => r.polygon.map(([x, y]) => ({ x: (x / 1000) * out.width, y: (y / 1000) * out.height }))), home!);
        note = rooms.length ? `Found ${rooms.length} enclosed areas by detecting the walls in your image. Room names are suggestions based on size and your ${HOME_TYPES.find((h) => h.id === home)!.label} home type — please confirm them.` : "No enclosed rooms could be detected automatically. Outline the rooms manually in the next step.";
      } catch {
        note = "Automatic wall detection failed. Outline the rooms manually in the next step.";
      }
      // A new upload replaces all previous geometry, calibration and layouts.
      setApartment(() => ({ ...base, rooms, autoScale: estimateScale(rooms, sqft), detection: rooms.length ? "manual" : "failed", detectionNote: note }));
    } catch {
      setErr("Could not read this image. Please try a JPG or PNG file.");
    }
    setBusy(false);
  };

  return (
    <WizardScaffold
      step={1}
      title="Let's Understand Your Space"
      subtitle="Tell us about your apartment, then upload its floor plan (JPG or PNG)."
      cta={{ label: "Continue", disabled: !ap.source || busy || (ap.source === "upload" && !infoOk), onPress: () => router.push("/plan/dimensions"), testID: "upload-continue-button" }}
    >
      <Card style={{ gap: spacing.md }} testID="apartment-info-card">
        <Text style={s.h}>1. Apartment details</Text>
        <Text style={s.k}>Apartment size (sq ft)</Text>
        <TextInput testID="apartment-size-input" style={s.input} keyboardType="number-pad" value={size} placeholder="e.g. 650" placeholderTextColor={colors.muted} onChangeText={(t) => setSize(t.replace(/[^0-9]/g, ""))} onEndEditing={() => saveInfo(sqft, home)} onBlur={() => saveInfo(sqft, home)} />
        <Text style={s.k}>Home type</Text>
        <View style={s.wrap}>
          {HOME_TYPES.map((h) => (
            <Chip key={h.id} label={h.label} selected={home === h.id} onPress={() => (setHome(h.id), saveInfo(sqft, h.id))} testID={`home-type-${h.id}`} />
          ))}
        </View>
      </Card>

      <Text style={s.h}>2. Floor plan</Text>
      <Pressable onPress={pick} style={[s.drop, !infoOk && { opacity: 0.5 }]} testID="upload-floorplan-zone">
        <Feather name="upload-cloud" size={32} color={colors.brandPrimary} />
        <Text style={s.dropTitle}>{ap.source === "upload" ? "Upload a different floor plan" : "Tap to upload your floor plan"}</Text>
        <Text style={s.dropSub}>{infoOk ? "JPG or PNG · PDFs must be exported as an image" : "Fill in apartment size and home type first"}</Text>
      </Pressable>
      {err ? <Notice tone="error" text={err} testID="upload-error" /> : null}
      {busy ? (
        <View style={s.row} testID="upload-busy">
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={s.dropSub}>Reading your plan and detecting walls…</Text>
        </View>
      ) : null}
      {ap.source === "upload" && ap.imageUri ? (
        <Card testID="floorplan-preview" style={{ gap: spacing.md }}>
          <Text style={s.cardTitle} testID="floorplan-file-name">
            {ap.fileName}
          </Text>
          <Image source={{ uri: ap.imageUri }} style={[s.preview, { aspectRatio: ap.imgW / ap.imgH || 1.3 }]} contentFit="contain" testID="upload-plan-image" />
          {ap.detectionNote ? <Notice tone={ap.detection === "failed" ? "warning" : "info"} text={ap.detectionNote} testID="detection-note" /> : null}
        </Card>
      ) : null}

      <Button kind="ghost" small label="No floor plan? Try a Demo apartment" icon="play-circle" onPress={() => (loadDemo(), setErr(null), setSize("650"), setHome("1b1b"))} testID="try-demo-button" />
      {ap.source === "sample" ? <Notice text="Demo mode: a structured sample 1B1B apartment (650 sq ft), not your upload." testID="demo-notice" /> : null}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: spacing.md, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  drop: { borderWidth: 2, borderStyle: "dashed", borderColor: c.borderStrong, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary },
  dropTitle: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  dropSub: { flexShrink: 1, fontFamily: fonts.text, fontSize: 13, color: c.muted, lineHeight: 19, textAlign: "center" },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  preview: { width: "100%", borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
}));
