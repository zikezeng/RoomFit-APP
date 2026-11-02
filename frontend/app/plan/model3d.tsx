import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";

import { Model3DView } from "@/src/components/Model3DView";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { generate3D, Plan3DResult, ROOM_COLORS } from "@/src/lib/floorplan3d";
import { KIND_LABEL } from "@/src/lib/apartment";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HEIGHTS = [
  { m: 2.44, label: "8 ft" },
  { m: 2.7, label: "8 ft 10 in" },
  { m: 3.05, label: "10 ft" },
];

export default function Model3DStep() {
  const router = useRouter();
  const { state } = usePlan();
  const ap = state.apartment;
  const s = useStyles();
  const { colors } = useTheme();
  const [wallHeight, setWallHeight] = useState(2.7);
  const [labels, setLabels] = useState(true);
  const [result, setResult] = useState<Plan3DResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const hasPlan = ap.source === "upload" && !!ap.imageUri;

  const run = useCallback(async () => {
    if (!hasPlan) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const timeout = setTimeout(() => ctl.abort(), 180_000);
    setBusy(true);
    setErr(null);
    setSeconds(0);
    const tick = setInterval(() => setSeconds((x) => x + 1), 1000);
    try {
      setResult(await generate3D(ap.imageUri!, ap.sizeSqft, wallHeight, ctl.signal));
    } catch (e) {
      if (ctl.signal.aborted && abort.current !== ctl) return; // replaced by a newer request
      setErr(ctl.signal.aborted ? "The server took too long to answer. Tap Try again — it may have been waking up." : (e as Error).message);
    } finally {
      clearTimeout(timeout);
      clearInterval(tick);
      if (abort.current === ctl) setBusy(false);
    }
  }, [hasPlan, ap.imageUri, ap.sizeSqft, wallHeight]);

  useEffect(() => {
    // build (or rebuild for a new ceiling height) once the screen has rendered
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [run]);
  useEffect(() => () => abort.current?.abort(), []);

  return (
    <WizardScaffold
      step={1}
      title="Your Floor Plan in 3D"
      subtitle="We recognise the walls, doors, windows and rooms in your plan and build a 3D model. Drag to rotate, pinch to zoom."
      cta={{ label: "Continue to Dimensions", onPress: () => router.push("/plan/dimensions"), testID: "model3d-continue-button" }}
    >
      {!hasPlan ? (
        <Notice tone="warning" text="Upload a floor plan image first to see it in 3D." testID="model3d-no-plan" />
      ) : (
        <>
          <View style={s.viewer} testID="model3d-viewer-box">
            {result ? <Model3DView glbBase64={result.glbBase64} rooms={result.rooms} showLabels={labels} style={{ flex: 1 }} testID="model3d-viewer" /> : null}
            {busy ? (
              <View style={s.overlay} testID="model3d-loading">
                <ActivityIndicator color={colors.brandPrimary} size="large" />
                <Text style={s.loadTitle}>Building your 3D model… {seconds}s</Text>
                <Text style={s.loadSub}>{seconds < 12 ? "Recognising walls, doors and windows." : "The server is waking up. The first model can take about a minute; after that it is quick."}</Text>
              </View>
            ) : null}
          </View>

          {err ? (
            <View style={{ gap: spacing.sm }}>
              <Notice tone="error" text={err} testID="model3d-error" />
              <Button kind="secondary" small label="Try again" icon="refresh-cw" onPress={run} testID="model3d-retry-button" />
            </View>
          ) : null}

          <Card style={{ gap: spacing.md }} testID="model3d-controls">
            <Text style={s.k}>Ceiling height</Text>
            <View style={s.wrap}>
              {HEIGHTS.map((h) => (
                <Chip key={h.m} label={h.label} selected={wallHeight === h.m} onPress={() => setWallHeight(h.m)} testID={`model3d-height-${h.m}`} />
              ))}
            </View>
            <View style={s.row}>
              <Text style={[s.k, { flex: 1 }]}>Show room names</Text>
              <Switch value={labels} onValueChange={setLabels} testID="model3d-labels-switch" />
            </View>
          </Card>

          {result ? (
            <Card style={{ gap: spacing.sm }} testID="model3d-rooms">
              <Text style={s.h}>What we found</Text>
              <Text style={s.k}>
                {result.rooms.length} rooms · {result.doors} doors · {result.windows} windows · about {Math.round(result.totalSqft)} sq ft of floor
              </Text>
              {result.rooms
                .slice()
                .sort((a, b) => b.area_m2 - a.area_m2)
                .map((r, i) => (
                  <View key={i} style={s.roomRow} testID={`model3d-room-${i}`}>
                    <View style={[s.swatch, { backgroundColor: ROOM_COLORS[r.type] ?? ROOM_COLORS.other }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.roomName}>{r.label}</Text>
                      <Text style={s.k}>{KIND_LABEL[r.type] ?? r.type}</Text>
                    </View>
                    <Text style={s.area}>{Math.round(r.area_sqft)} sq ft</Text>
                  </View>
                ))}
              <Text style={s.foot}>Room names are suggestions. You can rename and fix rooms in the next step. Scale: {result.scaleSource}.</Text>
            </Card>
          ) : null}
        </>
      )}
    </WizardScaffold>
  );
}


const useStyles = makeStyles((c) => ({
  viewer: { width: "100%", aspectRatio: 1, maxHeight: 520, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: c.surfaceTertiary + "E6" },
  loadTitle: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", color: c.onSurface },
  loadSub: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted, textAlign: "center", maxWidth: 320 },
  h: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  k: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  roomRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.divider },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  roomName: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  area: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface, fontVariant: ["tabular-nums"] },
  foot: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: spacing.xs },
}));
