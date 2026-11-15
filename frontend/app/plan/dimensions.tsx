import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { PlanCanvas, roomColor } from "@/src/components/PlanCanvas";
import { Button, Card, Chip, Notice } from "@/src/components/ui";
import { WizardScaffold } from "@/src/components/WizardScaffold";
import { KIND_LABEL, ROOM_KINDS, SQFT_CM2, dist, distToSeg, estimateScale, pointInPoly, roomStats, uid } from "@/src/lib/apartment";
import { fmtAreaCm2, fmtLen } from "@/src/lib/geometry";
import { Apartment, Pt } from "@/src/lib/types";
import { usePlan } from "@/src/state/plan-store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Mode = "select" | "corners" | "door";
const MODES: { id: Mode; label: string }[] = [
  { id: "select", label: "Select room" },
  { id: "corners", label: "Edit corners" },
  { id: "door", label: "Mark door (required)" },
];

function isRoomDoor(rooms: Apartment["rooms"], a: Pt, b: Pt, tolerance: number) {
  return dist(a, b) > 0 && rooms.some(({ poly }) => poly.some((start, i) => {
    const end = poly[(i + 1) % poly.length];
    return distToSeg(a, start, end) <= tolerance && distToSeg(b, start, end) <= tolerance;
  }));
}

export default function DimensionsStep() {
  const router = useRouter();
  const { stage } = useLocalSearchParams<{ stage?: string }>();
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
  const [confirmedSizes, setConfirmedSizes] = useState<Set<string>>(() => new Set());
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragV = useRef<{ roomId: string; i: number } | null>(null);
  const room = ap.rooms.find((r) => r.id === roomId);
  const doorMarked = ap.openings.some((opening) =>
    opening.type === "door" && isRoomDoor(ap.rooms, opening.a, opening.b, 12),
  );
  const roomsReady = ap.rooms.length > 0 && doorMarked;
  const reviewingSizes = stage === "sizes" && roomsReady;

  // Room edits keep the apartment-size scale estimate in sync.
  const setRooms = (fn: (r: Apartment["rooms"]) => Apartment["rooms"]) =>
    setApartment((a) => {
      const rooms = fn(a.rooms);
      return { ...a, rooms, autoScale: a.sizeSqft ? estimateScale(rooms, a.sizeSqft) : a.autoScale };
    });
  const editRoom = (id: string, patch: Partial<Apartment["rooms"][number]>) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onTap = (p: Pt, tol: number) => {
    setErr(null);
    if (mode === "door") {
      const tolerance = Math.min(tol, 12);
      if (!draft.length) {
        if (!ap.rooms.some(({ poly }) => poly.some((start, i) => distToSeg(p, start, poly[(i + 1) % poly.length]) <= tolerance))) {
          return setErr("Tap the first end of a door along a room wall.");
        }
        return setDraft([p]);
      }
      const a = draft[0];
      if (!isRoomDoor(ap.rooms, a, p, tolerance)) return setErr("Tap the other end of the door on the same wall.");
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
  const confirmSize = (id: string) => setConfirmedSizes((ids) => new Set(ids).add(id));

  const beginAreaEdit = (r: Apartment["rooms"][number]) => {
    const st = roomStats(ap, r);
    const sqft = r.manualSqft ?? (st ? st.area / SQFT_CM2 : null);
    setAreaText(sqft ? String(Math.round(sqft)) : "");
    setEditingRoomId(r.id);
    setErr(null);
  };

  const saveAreaEdit = (r: Apartment["rooms"][number]) => {
    const sqft = Number(areaText.replace(",", "."));
    if (!isFinite(sqft) || sqft < 10 || sqft > 10000) {
      setErr("Enter a realistic room size between 10 and 10,000 sq ft.");
      return;
    }
    editRoom(r.id, { manualSqft: sqft });
    confirmSize(r.id);
    setEditingRoomId(null);
    setAreaText("");
    setErr(null);
  };

  const resetEstimatedArea = (r: Apartment["rooms"][number]) => {
    editRoom(r.id, { manualSqft: null });
    setConfirmedSizes((ids) => {
      const next = new Set(ids);
      next.delete(r.id);
      return next;
    });
    setEditingRoomId(null);
    setAreaText("");
    setErr(null);
  };

  return (
    <WizardScaffold
      step={2}
      title={reviewingSizes ? "2. Confirm Room Sizes" : "1. Confirm Your Rooms"}
      cta={reviewingSizes ? {
        label: "Confirm room sizes",
        disabled: !!editingRoomId || ap.rooms.some((r) => !roomStats(ap, r) || !confirmedSizes.has(r.id)),
        onPress: () => router.push("/plan/rooms"),
        testID: "confirm-room-sizes-button",
      } : {
        label: doorMarked ? "Confirm rooms" : "Mark a door to continue",
        disabled: !roomsReady || draft.length > 0,
        onPress: () => router.push({ pathname: "/plan/dimensions", params: { stage: "sizes" } }),
        testID: "confirm-dimensions-button",
      }}
      scrollEnabled={!dragging}
    >
      {!reviewingSizes ? (
        <>
          {!ap.rooms.length ? <Notice tone="warning" text="Go back and upload a floor plan with detectable rooms." /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {MODES.map((m) => (
              <Chip key={m.id} label={m.label} selected={mode === m.id} onPress={() => (setMode(m.id), setDraft([]), setVertex(null), setErr(null))} testID={`mode-${m.id}`} />
            ))}
          </ScrollView>
          <PlanCanvas ap={ap} selectedRoomId={roomId} vertex={vertex} draft={draft} onTap={onTap} onDragStart={onDragStart} onDrag={onDrag} onDragEnd={() => ((dragV.current = null), setDragging(false))} testID="editor-canvas" />
          {mode === "door" ? (
            <Text style={s.p}>{draft.length ? "Tap the other end of the door." : "Tap both ends of a door opening along a room wall."}</Text>
          ) : null}
          {mode === "corners" && room && vertex?.roomId === room.id ? (
            <View style={s.row}>
              <Text style={[s.p, { flex: 1 }]} testID="selected-corner-text">Corner {vertex.i + 1} of {room.poly.length} selected</Text>
              <Button small kind="secondary" icon="x-circle" label="Delete corner" onPress={deleteCorner} testID="delete-corner-button" />
            </View>
          ) : null}
          {draft.length ? (
            <Button small kind="secondary" label="Undo door point" onPress={() => (setDraft([]), setErr(null))} testID="undo-point-button" />
          ) : null}
          {err ? <Notice tone="error" text={err} testID="editor-error" /> : null}
          {room ? (
            <Card style={{ gap: spacing.md }} testID="room-editor-card">
              <Text style={s.h}>Selected: what is this room?</Text>
              <View style={s.wrap}>
                {ROOM_KINDS.map((k) => (
                  <Chip key={k.id} label={k.label} selected={room.kind === k.id} onPress={() => editRoom(room.id, { kind: k.id, label: k.label })} testID={`room-kind-${k.id}`} />
                ))}
              </View>
              <TextInput testID="room-label-input" style={s.input} value={room.label} onChangeText={(t) => editRoom(room.id, { label: t })} />
              {ap.rooms.length > 1 ? (
                <Button small kind="secondary" icon="trash-2" label="Remove this area" onPress={() => (setRooms((rs) => rs.filter((r) => r.id !== room.id)), setRoomId(null), setDraft([]), setVertex(null))} testID="delete-room-button" />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      <Text style={s.h}>Rooms ({ap.rooms.length})</Text>
      {ap.rooms.map((r, i) => {
        const st = roomStats(ap, r);
        const editing = reviewingSizes && editingRoomId === r.id;
        const confirmed = confirmedSizes.has(r.id);
        return (
          <View key={r.id} style={[s.roomCard, roomId === r.id && { borderColor: colors.brandPrimary }]} testID={`room-row-${i}`}>
            <View style={s.roomSummary}>
              <Pressable
                disabled={reviewingSizes}
                onPress={() => (setRoomId(r.id), setMode("select"), setDraft([]), setVertex(null), setErr(null))}
                style={s.roomSelect}
              >
                <View style={[s.dot, { backgroundColor: roomColor(colors, r.kind) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.label}</Text>
                  <Text style={s.p}>{KIND_LABEL[r.kind]}</Text>
                  {reviewingSizes ? (
                    <>
                      <Text style={s.p} testID={`room-dims-${i}`}>
                        {st ? `${fmtLen(st.w, ap.unit)} × ${fmtLen(st.l, ap.unit)} · ${fmtAreaCm2(st.area, ap.unit)}` : "Size unavailable"}
                      </Text>
                      <Text style={s.meta}>{confirmed ? "Confirmed" : r.manualSqft ? "Saved size" : "Estimated from floor plan"}</Text>
                    </>
                  ) : null}
                </View>
              </Pressable>
            </View>
            {reviewingSizes && !editing ? (
              <View style={s.row}>
                {!confirmed && st ? (
                  <Button small label="Confirm size" onPress={() => confirmSize(r.id)} testID={`confirm-room-size-${i}`} />
                ) : null}
                <Button small kind="secondary" label="Edit size" disabled={!!editingRoomId} onPress={() => beginAreaEdit(r)} testID={`edit-room-size-${i}`} />
              </View>
            ) : null}

            {editing ? (
              <View style={s.sizeEditor} testID={`room-size-editor-${i}`}>
                <Text style={s.k}>Room area (sq ft)</Text>
                <TextInput
                  testID={`room-size-input-${i}`}
                  style={s.input}
                  keyboardType="decimal-pad"
                  value={areaText}
                  onChangeText={(t) => setAreaText(t.replace(/[^0-9.,]/g, ""))}
                  placeholder="e.g. 180"
                  placeholderTextColor={colors.muted}
                />
                {err ? <Notice tone="error" text={err} testID="editor-error" /> : null}
                <View style={s.row}>
                  <Button small label="Save size" onPress={() => saveAreaEdit(r)} testID={`save-room-size-${i}`} />
                  {r.manualSqft ? (
                    <Button small kind="secondary" label="Use estimate" onPress={() => resetEstimatedArea(r)} testID={`use-estimate-${i}`} />
                  ) : null}
                  <Button small kind="ghost" label="Cancel" onPress={() => (setEditingRoomId(null), setAreaText(""), setErr(null))} testID={`cancel-room-size-${i}`} />
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
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
