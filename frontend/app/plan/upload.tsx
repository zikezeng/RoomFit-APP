import Feather from "@react-native-vector-icons/feather";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FloorPlan } from "@/src/components/FloorPlan";
import { Button, Card, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { detectFloorPlan } from "@/src/lib/ai";
import { SAMPLE_ROOM } from "@/src/lib/geometry";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UploadStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fp = state.floorPlan;

  const pick = async () => {
    setErr(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    const isPdf = a.mimeType === "application/pdf" || a.name.toLowerCase().endsWith(".pdf");
    const ok = isPdf || /\.(jpe?g|png)$/i.test(a.name) || a.mimeType?.startsWith("image/");
    if (!ok) return setErr("Please choose a JPG, PNG or PDF file.");
    update({ floorPlan: { source: "upload", uri: a.uri, name: a.name, kind: isPdf ? "pdf" : "image" }, room: SAMPLE_ROOM, dimsConfirmed: false }, "all");
    const det = await detectFloorPlan(a.uri);
    setNote(det.message);
  };

  const useSample = () => {
    update({ floorPlan: { source: "sample", uri: null, name: "Sample apartment — living room", kind: null }, room: SAMPLE_ROOM, dimsConfirmed: false }, "all");
    setNote(null);
  };

  return (
    <WizardScaffold
      step={1}
      title="Let's Understand Your Space"
      subtitle="Upload a floor plan (JPG, PNG or PDF) or use our sample apartment."
      cta={{ label: "Continue", disabled: !fp.source, onPress: () => router.push("/plan/dimensions"), testID: "upload-continue-button" }}
    >
      <Pressable onPress={pick} style={s.drop} testID="upload-floorplan-zone">
        <Feather name="upload-cloud" size={32} color={colors.brandPrimary} />
        <Text style={s.dropTitle}>Tap to upload your floor plan</Text>
        <Text style={s.dropSub}>JPG, PNG or PDF · drag & drop not available on mobile</Text>
      </Pressable>
      <Button kind="secondary" label="Use sample floor plan" icon="layout" onPress={useSample} testID="use-sample-floorplan-button" />
      {err ? <Notice tone="error" text={err} testID="upload-error" /> : null}

      {fp.source === "upload" ? (
        <Card testID="uploaded-preview">
          <Text style={s.cardTitle}>{fp.name}</Text>
          {fp.kind === "image" && fp.uri ? (
            <Image source={{ uri: fp.uri }} style={s.preview} contentFit="contain" />
          ) : (
            <View style={[s.preview, s.pdf]}>
              <Feather name="file-text" size={40} color={colors.muted} />
              <Text style={s.dropSub}>PDF attached — preview not supported on device</Text>
            </View>
          )}
          <View style={{ height: spacing.md }} />
          <Notice tone="warning" text={note ?? "Automatic wall, door and window detection is not connected in this prototype. You will define the room manually in the next step."} testID="detection-unavailable-notice" />
        </Card>
      ) : null}

      {fp.source === "sample" ? (
        <Card testID="sample-preview">
          <Text style={s.cardTitle}>{fp.name}</Text>
          <Text style={s.dropSub}>Structured geometry: 4 walls, 1 door (bottom), 2 windows (blue). You'll confirm the real scale next.</Text>
          <View style={{ height: spacing.md }} />
          <FloorPlan room={state.room} testID="sample-floorplan-svg" />
        </Card>
      ) : null}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  drop: { borderWidth: 2, borderStyle: "dashed", borderColor: c.borderStrong, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary },
  dropTitle: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  dropSub: { fontFamily: fonts.text, fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 19 },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, marginBottom: spacing.sm },
  preview: { width: "100%", height: 240, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  pdf: { alignItems: "center", justifyContent: "center", gap: spacing.sm },
}));
