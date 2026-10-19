import Feather from "@react-native-vector-icons/feather";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Image } from "expo-image";
import { Button, Card, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { emptyApartment, emptyRoom, usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UploadStep() {
  const router = useRouter();
  const { state, setApartment, update, loadDemo } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ap = state.apartment;

  const pick = async () => {
    setErr(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    if (a.mimeType === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")) {
      return setErr("PDF received, but the room editor needs an image. Please export the floor-plan page as PNG or JPG and upload that.");
    }
    setBusy(true);
    try {
      const first = await ImageManipulator.manipulate(a.uri).renderAsync();
      const ctx = ImageManipulator.manipulate(a.uri);
      if (first.width > 1400) ctx.resize({ width: 1400 });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      const uri = `data:image/jpeg;base64,${out.base64}`;
      // New upload = new source of truth: wipe any previous geometry, calibration and layouts.
      setApartment(() => ({ ...emptyApartment(), source: "upload", fileName: a.name, imageUri: uri, imgW: out.width, imgH: out.height, detection: "manual", detectionNote: "Floor plan uploaded. Automatic wall detection is not used — you will confirm the room dimensions in the next step." }));
      update({ room: emptyRoom(), dimsConfirmed: false, roomKind: null }, "all");
      setBusy(false);
    } catch {
      setBusy(false);
      setErr("Could not read this image. Please try a JPG or PNG file.");
    }
  };

  const pending = ap.detection === "pending" || busy;

  return (
    <WizardScaffold
      step={1}
      title="Let's Understand Your Space"
      subtitle="Upload your apartment floor plan (JPG or PNG). You will confirm the room dimensions in the next step."
      cta={{ label: "Continue", disabled: !ap.source || pending, onPress: () => router.push("/plan/dimensions"), testID: "upload-continue-button" }}
    >
      <Pressable onPress={pick} style={s.drop} testID="upload-floorplan-zone">
        <Feather name="upload-cloud" size={32} color={colors.brandPrimary} />
        <Text style={s.dropTitle}>{ap.source === "upload" ? "Upload a different floor plan" : "Tap to upload your floor plan"}</Text>
        <Text style={s.dropSub}>JPG or PNG · PDFs must be exported as an image</Text>
      </Pressable>
      {err ? <Notice tone="error" text={err} testID="upload-error" /> : null}

      {ap.source ? (
        <Card testID="floorplan-preview" style={{ gap: spacing.md }}>
          <Text style={s.cardTitle} testID="floorplan-file-name">
            {ap.fileName}
          </Text>
          {ap.imageUri ? <Image source={{ uri: ap.imageUri }} style={[s.preview, { aspectRatio: ap.imgW / ap.imgH || 1.3 }]} contentFit="contain" testID="upload-plan-image" /> : null}
          {pending ? (
            <View style={s.row} testID="detection-pending">
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={s.dropSub}>Recognising walls, rooms, doors and windows… (up to a minute)</Text>
            </View>
          ) : ap.detectionNote ? (
            <Notice tone={ap.detection === "failed" ? "warning" : "info"} text={ap.detectionNote} testID="detection-note" />
          ) : null}
        </Card>
      ) : null}

      <Button kind="ghost" small label="No floor plan? Try a Demo apartment" icon="play-circle" onPress={() => (loadDemo(), setErr(null))} testID="try-demo-button" />
      {ap.source === "sample" ? <Notice text="Demo mode: a sample 4.8 × 3.6 m living room (not your upload)." testID="demo-notice" /> : null}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  drop: { borderWidth: 2, borderStyle: "dashed", borderColor: c.borderStrong, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary },
  dropTitle: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  dropSub: { flexShrink: 1, fontFamily: fonts.text, fontSize: 13, color: c.muted, lineHeight: 19 },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  preview: { width: "100%", borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
}));
