import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { FloorPlan } from "@/src/components/FloorPlan";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { WALL_LABEL, calibrate, fmtArea, fromUnit, toUnit, validateDims } from "@/src/lib/geometry";
import { Unit, Wall } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const WALLS: Wall[] = ["top", "bottom", "left", "right"];
const POS = [
  { label: "Start", at: 0.16 },
  { label: "Centre", at: 0.5 },
  { label: "End", at: 0.84 },
];

export default function DimensionsStep() {
  const router = useRouter();
  const { state, update } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const room = state.room;
  const u = room.unit;
  const [wall, setWall] = useState<Wall>("left");
  const [known, setKnown] = useState(toUnit(room.length, u).toFixed(2));
  const [w, setW] = useState(toUnit(room.width, u).toFixed(2));
  const [l, setL] = useState(toUnit(room.length, u).toFixed(2));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const sync = (r: typeof room) => {
    setW(toUnit(r.width, r.unit).toFixed(2));
    setL(toUnit(r.length, r.unit).toFixed(2));
  };
  const setRoom = (r: typeof room) => {
    update({ room: r, dimsConfirmed: false }, "all");
    sync(r);
  };
  const applyScale = () => {
    const cm = fromUnit(parseFloat(known), u);
    const r = calibrate(room, wall, cm);
    const e = validateDims(r.width, r.length);
    if (e) return (setErr(e), setOk(null));
    setErr(null);
    setOk(`Scaled the plan so the ${WALL_LABEL[wall].toLowerCase()} measures ${known} ${u}.`);
    setRoom(r);
  };
  const applyManual = () => {
    const cw = Math.round(fromUnit(parseFloat(w), u));
    const cl = Math.round(fromUnit(parseFloat(l), u));
    const e = validateDims(cw, cl);
    if (e) return (setErr(e), setOk(null));
    setErr(null);
    setOk("Room dimensions updated.");
    setRoom({ ...room, width: cw, length: cl });
  };
  const setUnit = (nu: Unit) => {
    const r = { ...room, unit: nu };
    update({ room: r });
    sync(r);
    setKnown(toUnit(fromUnit(parseFloat(known) || 0, u), nu).toFixed(2));
  };
  const toggleWindow = (wl: Wall) => {
    const has = room.windows.some((x) => x.wall === wl);
    setRoom({ ...room, windows: has ? room.windows.filter((x) => x.wall !== wl) : [...room.windows, { wall: wl, at: 0.5, width: 120 }] });
  };
  const confirm = () => {
    const e = validateDims(room.width, room.length);
    if (e) return setErr(e);
    update({ dimsConfirmed: true });
    router.push("/plan/furniture");
  };

  return (
    <WizardScaffold step={2} title="Make Sure Everything Fits" subtitle="To accurately recommend furniture, we need to confirm your room dimensions." cta={{ label: "Confirm dimensions", onPress: confirm, testID: "confirm-dimensions-button" }}>
      <Card>
        <FloorPlan room={room} highlightWall={wall} testID="dimensions-floorplan-svg" />
        <View style={s.stats}>
          <View>
            <Text style={s.k}>Size</Text>
            <Text style={s.v} testID="room-size-text">
              {toUnit(room.width, u).toFixed(2)} × {toUnit(room.length, u).toFixed(2)} {u}
            </Text>
          </View>
          <View>
            <Text style={s.k}>Floor area</Text>
            <Text style={s.v} testID="floor-area-text">
              {fmtArea(room)}
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
        <Text style={s.h}>1. Calibrate from a known wall</Text>
        <Text style={s.p}>Select a wall (highlighted in green) and enter its real length. The plan scales proportionally.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {WALLS.map((x) => (
            <Chip key={x} label={WALL_LABEL[x]} selected={wall === x} onPress={() => setWall(x)} testID={`wall-chip-${x}`} />
          ))}
        </ScrollView>
        <View style={s.row}>
          <TextInput testID="known-wall-input" style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" value={known} onChangeText={setKnown} placeholder={`Length in ${u}`} placeholderTextColor={colors.muted} />
          <Button small label="Apply scale" onPress={applyScale} testID="apply-scale-button" />
        </View>
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text style={s.h}>2. Or correct width & length manually</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>Width ({u})</Text>
            <TextInput testID="room-width-input" style={s.input} keyboardType="decimal-pad" value={w} onChangeText={setW} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>Length ({u})</Text>
            <TextInput testID="room-length-input" style={s.input} keyboardType="decimal-pad" value={l} onChangeText={setL} />
          </View>
        </View>
        <Button small kind="secondary" label="Update dimensions" onPress={applyManual} testID="apply-manual-dims-button" />
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text style={s.h}>3. Doors & windows</Text>
        <Text style={s.k}>Door wall</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {WALLS.map((x) => (
            <Chip key={x} label={WALL_LABEL[x]} selected={room.door.wall === x} onPress={() => setRoom({ ...room, door: { ...room.door, wall: x } })} testID={`door-wall-${x}`} />
          ))}
        </ScrollView>
        <Text style={s.k}>Door position</Text>
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
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: spacing.md, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
}));
