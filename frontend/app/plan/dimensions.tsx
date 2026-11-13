import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, ROOM_KINDS, SQFT_CM2, dist, distToSeg, estimateScale, homeTypeWarnings, pointInPoly, roomStats, scaleOf, uid } from "@/src/lib/apartment";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { Apartment, Pt } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Mode = "select" | "draw" | "corners" | "door";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "select", label: "Select room", hint: "Tap a room to select it, then confirm or correct its type and size below." },
  { id: "draw", label: "Add room", hint: "Tap “Add rectangle” for a quick box you can then reshape, or tap each corner of a missing room in order and press Finish room." },
  { id: "corners", label: "Edit corners", hint: "Drag any corner to move it. Tap on a wall line to add a corner; tap a corner and press Delete corner to remove it." },
  { id: "door", label: "Mark door", hint: "Tap both ends of a door opening so furniture never blocks it." },
];

export default function DimensionsStep() {
  const router = useRouter();
  const { state, setApartment } = usePlan();
  const s = useStyles();
  const { colors } = useTheme();
  const ap = state.apartment;
  const [mode, setMode] = useState<Mode>("select");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [vertex, setVertex] = useState<{ roomId: string; i: number } | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [areaText, setAreaText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragV = useRef<{ roomId: string; i: number } | null>(null);
  const room = ap.rooms.find((r) => r.id === roomId);
  const scale = scaleOf(ap);
  const warnings = homeTypeWarnings(ap);

  // Room edits keep the apartment-size scale estimate in sync.
  const setRooms = (fn: (r: Apartment["rooms"]) => Apartment["rooms"]) =>
    setApartment((a) => {
      const rooms = fn(a.rooms);
      return { ...a, rooms, autoScale: a.sizeSqft ? estimateScale(rooms, a.sizeSqft) : a.autoScale };
    });
  const editRoom = (id: string, patch: Partial<Apartment["rooms"][number]>) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onTap = (p: Pt, tol: number) => {
    setErr(null);
    if (mode === "draw") return setDraft((d) => [...d, p]);
    if (mode === "door") {
      if (!draft.length) return setDraft([p]);
      const a = draft[0];
      setDraft([]);
      return setApartment((x) => ({ ...x, openings: [...x.openings, { id: uid(), type: "door", a, b: p }] }));
    }
    if (mode === "corners") {
      const ei = room ? room.poly.findIndex((q, i) => distToSeg(p, q, room.poly[(i + 1) % room.poly.length]) <= tol) : -1;
      if (room && ei >= 0) {
        editRoom(room.id, { poly: [...room.poly.slice(0, ei + 1), p, ...room.poly.slice(ei + 1)] });
        return setVertex({ roomId: room.id, i: ei + 1 });
      }
      const hit = ap.rooms.find((r) => pointInPoly(p, r.poly));
      setVertex(null);
      if (hit) return setRoomId(hit.id);
      return setErr(room ? "Drag a corner, or tap on a wall line to add one." : "Tap a room to edit its corners.");
    }
    setRoomId(ap.rooms.find((r) => pointInPoly(p, r.poly))?.id ?? null);
  };

  // Corner dragging (Edit corners mode): grab the nearest corner of the selected room, or of any room.
  const onDragStart = (p: Pt, tol: number) => {
    if (mode !== "corners") return false;
    const pool = room ? [room, ...ap.rooms.filter((r) => r.id !== room.id)] : ap.rooms;
    for (const r of pool) {
      const vi = r.poly.findIndex((q) => dist(q, p) <= tol * 1.5);
      if (vi >= 0) {
        setErr(null);
        setRoomId(r.id);
        setVertex({ roomId: r.id, i: vi });
        dragV.current = { roomId: r.id, i: vi };
        setDragging(true);
        return true;
      }
    }
    return false;
  };
  const onDrag = (p: Pt) => {
    const v = dragV.current;
    if (!v) return;
    setRooms((rs) => rs.map((r) => (r.id === v.roomId ? { ...r, poly: r.poly.map((q, i) => (i === v.i ? p : q)) } : r)));
  };
  const deleteCorner = () => {
    if (!room || !vertex) return;
    if (room.poly.length <= 3) return setErr("A room needs at least 3 corners.");
    editRoom(room.id, { poly: room.poly.filter((_, i) => i !== vertex.i) });
    setVertex(null);
  };
  const addRect = () => {
    const w = ap.imgW * 0.25;
    const h = ap.imgH * 0.25;
    const x0 = ap.imgW / 2 - w / 2;
    const y0 = ap.imgH / 2 - h / 2;
    const id = uid();
    setRooms((rs) => [...rs, { id, kind: "other", label: `Room ${rs.length + 1}`, poly: [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }] }]);
    setDraft([]);
    setRoomId(id);
    setMode("corners");
  };

  const finishRoom = () => {
    if (draft.length < 3) return setErr("A room needs at least 3 corners.");
    const id = uid();
    setRooms((rs) => [...rs, { id, kind: "other", label: `Room ${rs.length + 1}`, poly: draft }]);
    setDraft([]);
    setRoomId(id);
    setMode("select");
  };

  const beginAreaEdit = (r: Apartment["rooms"][number]) => {
    const st = roomStats(ap, r);
    const sqft = r.manualSqft ?? (st ? st.area / SQFT_CM2 : null);
    setAreaText(sqft ? String(Math.round(sqft)) : "");
    setEditingRoomId(r.id);
    setErr(null);
  };

  const saveAreaEdit = (r: Apartment["rooms"][number]) => {
    const sqft = parseFloat(areaText.replace(",", "."));
    if (!isFinite(sqft) || sqft < 10 || sqft > 10000) {
      setErr("Enter a realistic room size between 10 and 10,000 sq ft.");
      return;
    }
    editRoom(r.id, { manualSqft: sqft });
    setEditingRoomId(null);
    setAreaText("");
    setErr(null);
  };

  const resetEstimatedArea = (r: Apartment["rooms"][number]) => {
    editRoom(r.id, { manualSqft: null });
    setEditingRoomId(null);
    setAreaText("");
    setErr(null);
  };

  return (
    <WizardScaffold
      step={2}
      title="Confirm Your Space"
      subtitle="We estimated each room from your floor plan. Review the results and edit any room if you know the exact size."
      cta={{ label: "Confirm rooms", disabled: !scale || ap.rooms.length === 0, onPress: () => router.push("/plan/rooms"), testID: "confirm-dimensions-button" }}
      scrollEnabled={!dragging}
    >
      {!ap.source ? <Notice tone="warning" text="No floor plan yet — go back to Step 1." /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {MODES.map((m) => (
          <Chip key={m.id} label={m.label} selected={mode === m.id} onPress={() => (setMode(m.id), setDraft([]), setVertex(null))} testID={`mode-${m.id}`} />
        ))}
      </ScrollView>
      <Text style={s.p}>{MODES.find((m) => m.id === mode)!.hint}</Text>
      <PlanCanvas ap={ap} selectedRoomId={roomId} vertex={vertex} draft={draft} onTap={onTap} onDragStart={onDragStart} onDrag={onDrag} onDragEnd={() => ((dragV.current = null), setDragging(false))} testID="editor-canvas" />
      {mode === "draw" && !draft.length ? <Button small icon="square" label="Add rectangle" onPress={addRect} testID="add-rect-room-button" /> : null}
      {mode === "corners" && room && vertex?.roomId === room.id ? (
        <View style={s.row}>
          <Text style={[s.p, { flex: 1 }]} testID="selected-corner-text">Corner {vertex.i + 1} of {room.poly.length} selected</Text>
          <Button small kind="secondary" icon="x-circle" label="Delete corner" onPress={deleteCorner} testID="delete-corner-button" />
        </View>
      ) : null}
      {draft.length ? (
        <View style={s.row}>
          {mode === "draw" ? <Button small label={`Finish room (${draft.length})`} onPress={finishRoom} testID="finish-room-button" style={{ flex: 1 }} /> : null}
          <Button small kind="secondary" label="Undo" onPress={() => setDraft((d) => d.slice(0, -1))} testID="undo-point-button" />
          <Button small kind="ghost" label="Cancel" onPress={() => setDraft([])} testID="cancel-draft-button" />
        </View>
      ) : null}
      {err ? <Notice tone="error" text={err} testID="editor-error" /> : null}
      {warnings.map((w) => (
        <Notice key={w} tone="warning" text={w} testID="home-type-warning" />
      ))}

      {room ? (
        <Card style={{ gap: spacing.md }} testID="room-editor-card">
          <Text style={s.h}>Selected: what is this room?</Text>
          <View style={s.wrap}>
            {ROOM_KINDS.map((k) => (
              <Chip key={k.id} label={k.label} selected={room.kind === k.id} onPress={() => editRoom(room.id, { kind: k.id, label: k.label })} testID={`room-kind-${k.id}`} />
            ))}
          </View>
          <TextInput testID="room-label-input" style={s.input} value={room.label} onChangeText={(t) => editRoom(room.id, { label: t })} />
          <Text style={s.p} testID="room-dims-text">
            {(() => {
              const st = roomStats(ap, room);
              return st ? `${room.manualSqft ? "User-confirmed size" : "Estimated size"}: ${fmtLen(st.w, ap.unit)} × ${fmtLen(st.l, ap.unit)} · ${fmtAreaCm2(st.area, ap.unit)}` : "Uncalibrated";
            })()}
          </Text>
          <Button small kind="secondary" icon="trash-2" label="Remove this area" onPress={() => (setRooms((rs) => rs.filter((r) => r.id !== room.id)), setRoomId(null))} testID="delete-room-button" />
        </Card>
      ) : null}

      <Text style={s.h}>Rooms ({ap.rooms.length})</Text>
      {ap.rooms.map((r, i) => {
        const st = roomStats(ap, r);
        const editing = editingRoomId === r.id;
        return (
          <View key={r.id} style={[s.roomCard, roomId === r.id && { borderColor: colors.brandPrimary }]} testID={`room-row-${i}`}>
            <View style={s.roomSummary}>
              <Pressable onPress={() => (setRoomId(r.id), setMode("select"))} style={s.roomSelect}>
                <View style={[s.dot, { backgroundColor: roomColor(colors, r.kind) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.label}</Text>
                  <Text style={s.p}>
                    {KIND_LABEL[r.kind]} · {st ? fmtAreaCm2(st.area, ap.unit) : "Uncalibrated"}
                  </Text>
                  <Text style={s.meta}>{r.manualSqft ? "User confirmed" : "Estimated from floor plan"}</Text>
                </View>
              </Pressable>
              <Button small kind="secondary" label="Edit size" onPress={() => beginAreaEdit(r)} testID={`edit-room-size-${i}`} />
            </View>

            {editing ? (
              <View style={s.sizeEditor} testID={`room-size-editor-${i}`}>
                <Text style={s.k}>Room area (sq ft)</Text>
                <TextInput
                  testID={`room-size-input-${i}`}
                  style={s.input}
                  keyboardType="decimal-pad"
                  value={areaText}
                  onChangeText={(t) => setAreaText(t.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 180"
                  placeholderTextColor={colors.muted}
                />
                <Text style={s.meta}>
                  If you know the exact area, enter it here. We’ll keep the detected room shape and recalculate its real-world dimensions.
                </Text>
                <View style={s.row}>
                  <Button small label="Save size" onPress={() => saveAreaEdit(r)} testID={`save-room-size-${i}`} />
                  {r.manualSqft ? (
                    <Button small kind="secondary" label="Use estimate" onPress={() => resetEstimatedArea(r)} testID={`use-estimate-${i}`} />
                  ) : (
                    <Button small kind="ghost" label="Cancel" onPress={() => (setEditingRoomId(null), setAreaText(""))} testID={`cancel-room-size-${i}`} />
                  )}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </WizardScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  chips: { gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  h: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  p: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.muted },
  k: { fontFamily: fonts.text, fontSize: 12, fontWeight: "600", color: c.muted },
  meta: { fontFamily: fonts.text, fontSize: 11, lineHeight: 16, color: c.muted },
  name: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: spacing.md, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  roomCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  roomSummary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  roomSelect: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  sizeEditor: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
  dot: { width: 16, height: 16, borderRadius: 8 },
}));
