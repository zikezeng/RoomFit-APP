import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { FloorPlan } from "@/src/components/FloorPlan";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { specToGeom } from "@/src/lib/apartment";
import { fmtAreaCm2, fromUnit, toUnit } from "@/src/lib/geometry";
import { RoomSpec, Unit, Wall } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const WALLS: Wall[] = ["top", "bottom", "left", "right"];
const WALL_LABEL: Record<Wall, string> = { top: "Top wall", bottom: "Bottom wall", left: "Left wall", right: "Right wall" };
const POS = [
  { label: "Start", at: 0.16 },
  { label: "Centre", at: 0.5 },
  { label: "End", at: 0.84 },
];
const MIN = 200;
const MAX = 1500;
const validate = (w: number, l: number) =>
  !isFinite(w) || !isFinite(l) || w <= 0 || l <= 0 ? "Please enter the room width and length." : w < MIN || l < MIN ? "Each side must be at least 2 m (6.6 ft)." : w > MAX || l > MAX ? "Each side must be under 15 m (49 ft)." : null;

export default function DimensionsStep() {
  const router = useRouter();
  const { state, update, setApartment } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const room = state.room;
  const u = state.apartment.unit;
  const fmt = (cm: number) => (cm > 0 ? toUnit(cm, u).toFixed(2) : "");
  const [wall, setWall] = useState<Wall>("left");
  const [known, setKnown] = useState("");
  const [w, setW] = useState(fmt(room.width));
  const [l, setL] = useState(fmt(room.length));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const hasDims = !validate(room.width, room.length);

  const setRoom = (r: RoomSpec) => {
    update({ room: r, dimsConfirmed: false }, "all");
    setW(fmt(r.width));
    setL(fmt(r.length));
  };
  const applyScale = () => {
    const cm = Math.round(fromUnit(parseFloat(known.replace(",", ".")), u));
    const horiz = wall === "top" || wall === "bottom";
    let r: RoomSpec;
    if (hasDims) {
      const k = cm / (horiz ? room.width : room.length); // keep proportions, scale to the known wall
      r = { ...room, width: Math.round(room.width * k), length: Math.round(room.length * k) };
    } else r = horiz ? { ...room, width: cm } : { ...room, length: cm };
    const e = hasDims || (r.width && r.length) ? validate(r.width, r.length) : cm >= MIN && cm <= MAX ? null : "Enter a wall length between 2 m and 15 m.";
    if (e) return (setErr(e), setOk(null));
    setErr(null);
    setOk(`${WALL_LABEL[wall]} set to ${known} ${u}.${!r.width || !r.length ? " Now enter the other side." : ""}`);
    setRoom(r);
  };
  const applyManual = () => {
    const cw = Math.round(fromUnit(parseFloat(w.replace(",", ".")), u));
    const cl = Math.round(fromUnit(parseFloat(l.replace(",", ".")), u));
    const e = validate(cw, cl);
    if (e) return (setErr(e), setOk(null));
    setErr(null);
    setOk("Room dimensions updated.");
    setRoom({ ...room, width: cw, length: cl });
  };
  const setUnit = (nu: Unit) => {
    setApartment((a) => ({ ...a, unit: nu }));
    setW(room.width ? toUnit(room.width, nu).toFixed(2) : "");
    setL(room.length ? toUnit(room.length, nu).toFixed(2) : "");
  };
  const toggleWindow = (wl: Wall) => {
    const has = room.windows.some((x) => x.wall === wl);
    setRoom({ ...room, windows: has ? room.windows.filter((x) => x.wall !== wl) : [...room.windows, { wall: wl, at: 0.5, width: 120 }] });
  };
  const confirm = () => {
    const e = validate(room.width, room.length);
    if (e) return setErr(e);
    update({ dimsConfirmed: true });
    router.push("/plan/rooms");
  };

  return (
    <WizardScaffold step={2} title="Make Sure Everything Fits" subtitle="To accurately recommend furniture, we need to confirm your room dimensions." cta={{ label: "Confirm dimensions", onPress: confirm, testID: "confirm-dimensions-button" }}>
      {state.apartment.imageUri ? (
        <Card style={{ gap: spacing.sm }} testID="reference-plan-card">
          <Text style={s.h}>Your floor plan</Text>
          <Image source={{ uri: state.apartment.imageUri }} style={[s.ref, { aspectRatio: state.apartment.imgW / state.apartment.imgH || 1.3 }]} contentFit="contain" testID="reference-plan-image" />
          <Text style={s.p}>Read the measurements of the room you want to furnish from your plan and enter them below. No dimensions are guessed from the image.</Text>
        </Card>
      ) : null}
      <Card>
        {hasDims ? (
          <FloorPlan geom={specToGeom(room, u, state.roomKind ?? "living")} testID="dimensions-floorplan-svg" />
        ) : (
          <Text style={s.p} testID="dims-uncalibrated">
            Uncalibrated — enter the room width and length to see a scaled plan.
          </Text>
        )}
        <View style={s.stats}>
          <View>
            <Text style={s.k}>Size</Text>
            <Text style={s.v} testID="room-size-text">
              {hasDims ? `${fmt(room.width)} × ${fmt(room.length)} ${u}` : "—"}
            </Text>
          </View>
          <View>
            <Text style={s.k}>Floor area</Text>
            <Text style={s.v} testID="floor-area-text">
              {hasDims ? fmtAreaCm2(room.width * room.length, u) : "—"}
            </Text>
          </View>
        </View>
      </Card>
      <View style={s.row}>
        <Chip label="Meters" selected={u === "m"} onPress={() => setUnit("m")} testID="unit-m-chip" />
        <Chip label="Feet" selected={u === "ft"} onPress={() => setUnit("ft")} testID="unit-ft-chip" />
      </View>
      {err ? <Notice tone="error" text={err} testID="dimensions-error" /> : null}
      {ok ? <Notice tone="success" text={ok} testID="dimensions-success" /> : null}
      <Card style={{ gap: spacing.md }}>
        <Text style={s.h}>1. Enter a known wall length</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {WALLS.map((x) => (
            <Chip key={x} label={WALL_LABEL[x]} selected={wall === x} onPress={() => setWall(x)} testID={`wall-chip-${x}`} />
          ))}
        </ScrollView>
        <View style={s.row}>
          <TextInput testID="known-wall-input" style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" value={known} onChangeText={setKnown} placeholder={`Length in ${u}`} placeholderTextColor={colors.muted} />
          <Button small label="Apply" onPress={applyScale} testID="apply-scale-button" />
        </View>
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text style={s.h}>2. Confirm width & length</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>Width ({u})</Text>
            <TextInput testID="room-width-input" style={s.input} keyboardType="decimal-pad" value={w} onChangeText={setW} placeholder="e.g. 4.80" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>Length ({u})</Text>
            <TextInput testID="room-length-input" style={s.input} keyboardType="decimal-pad" value={l} onChangeText={setL} placeholder="e.g. 3.60" placeholderTextColor={colors.muted} />
          </View>
        </View>
        <Button small kind="secondary" label="Update dimensions" onPress={applyManual} testID="apply-manual-dims-button" />
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text style={s.h}>3. Door & windows</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {WALLS.map((x) => (
            <Chip key={x} label={`Door: ${WALL_LABEL[x]}`} selected={room.door.wall === x} onPress={() => setRoom({ ...room, door: { ...room.door, wall: x } })} testID={`door-wall-${x}`} />
          ))}
        </ScrollView>
        <View style={s.row}>
          {POS.map((p) => (
            <Chip key={p.label} label={p.label} selected={Math.abs(room.door.at - p.at) < 0.01} onPress={() => setRoom({ ...room, door: { ...room.door, at: p.at } })} testID={`door-pos-${p.label.toLowerCase()}`} />
          ))}
        </View>
        <Text style={s.k}>Windows on</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {WALLS.map((x) => (
            <Chip key={x} label={WALL_LABEL[x]} selected={room.windows.some((y) => y.wall === x)} onPress={() => toggleWindow(x)} testID={`window-wall-${x}`} />
          ))}
        </ScrollView>
      </Card>
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  stats: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  k: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginBottom: 4 },
  v: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  h: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
  ref: { width: "100%", borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: spacing.md, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
}));
