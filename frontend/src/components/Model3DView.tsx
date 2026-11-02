// Interactive 3D viewer for a .glb model. Uses Google's <model-viewer> web component inside a
// WebView on phones (works in Expo Go) and inside an iframe in the web preview.
import React, { useMemo } from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

import type { Plan3DRoom } from "@/src/lib/floorplan3d";
import { useTheme } from "@/src/theme";

interface Props {
  glbBase64: string;
  rooms?: Plan3DRoom[];
  showLabels?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function viewerHtml(glb: string, rooms: Plan3DRoom[], showLabels: boolean, bg: string) {
  const hotspots = showLabels
    ? rooms
        .map((r, i) => `<div class="hs" slot="hotspot-${i}" data-position="${r.centroid[0]} 1.2 ${r.centroid[1]}" data-normal="0 1 0">${esc(r.label)}</div>`)
        .join("")
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<style>html,body{margin:0;height:100%;background:${bg};overflow:hidden}
model-viewer{width:100%;height:100%;--poster-color:transparent}
.hs{font:600 11px -apple-system,system-ui,sans-serif;color:#1c1b1a;background:rgba(255,255,255,.9);padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.2);pointer-events:none}
</style></head><body>
<model-viewer src="data:model/gltf-binary;base64,${glb}" camera-controls touch-action="none" interaction-prompt="none"
 camera-orbit="-20deg 40deg auto" min-camera-orbit="auto 0deg auto" max-camera-orbit="auto 85deg auto"
 tone-mapping="commerce" shadow-intensity="0.6" exposure="0.95">${hotspots}</model-viewer>
</body></html>`;
}

export function Model3DView({ glbBase64, rooms = [], showLabels = true, style, testID }: Props) {
  const { colors } = useTheme();
  const html = useMemo(() => viewerHtml(glbBase64, rooms, showLabels, colors.surfaceTertiary), [glbBase64, rooms, showLabels, colors.surfaceTertiary]);
  if (Platform.OS === "web") {
    return (
      <View style={style} testID={testID}>
        {React.createElement("iframe", { srcDoc: html, title: "3D floor plan", style: { border: 0, width: "100%", height: "100%", borderRadius: 12 } })}
      </View>
    );
  }
  return (
    <View style={[style, { overflow: "hidden" }]} testID={testID}>
      <WebView source={{ html, baseUrl: "https://roomfit.local/" }} originWhitelist={["*"]} javaScriptEnabled scrollEnabled={false} style={{ flex: 1, backgroundColor: colors.surfaceTertiary }} />
    </View>
  );
}
