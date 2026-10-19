import React from "react";
import { View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

import { CategoryId, StyleId } from "@/src/lib/types";
import { radius, useTheme } from "@/src/theme";

/** Illustrated top-down product thumbnail (demo catalog has no verified product photos). */
export function ProductSwatch({ category, style, size = 64, testID }: { category: CategoryId; style?: StyleId; size?: number; testID?: string }) {
  const { colors: c } = useTheme();
  const tone = { japandi: c.wood, scandinavian: c.surfaceTertiary, midcentury: c.woodDark, industrial: c.onSurfaceTertiary }[style ?? "japandi"];
  const accent = c.brandSecondary;
  const stroke = c.onSurfaceTertiary;
  const shape = () => {
    switch (category) {
      case "sofa":
        return (
          <>
            <Rect x={10} y={30} width={80} height={40} rx={8} fill={accent} stroke={stroke} strokeWidth={2} />
            <Rect x={10} y={22} width={80} height={14} rx={6} fill={tone} stroke={stroke} strokeWidth={2} />
            <Rect x={6} y={26} width={12} height={44} rx={5} fill={tone} stroke={stroke} strokeWidth={2} />
            <Rect x={82} y={26} width={12} height={44} rx={5} fill={tone} stroke={stroke} strokeWidth={2} />
          </>
        );
      case "armchair":
        return (
          <>
            <Rect x={24} y={28} width={52} height={46} rx={10} fill={accent} stroke={stroke} strokeWidth={2} />
            <Rect x={24} y={22} width={52} height={14} rx={6} fill={tone} stroke={stroke} strokeWidth={2} />
          </>
        );
      case "floor_lamp":
        return (
          <>
            <Circle cx={50} cy={50} r={26} fill={c.warning} opacity={0.5} />
            <Circle cx={50} cy={50} r={10} fill={tone} stroke={stroke} strokeWidth={2} />
          </>
        );
      case "side_table":
        return <Circle cx={50} cy={50} r={22} fill={tone} stroke={stroke} strokeWidth={2} />;
      case "rug":
        return <Rect x={12} y={22} width={76} height={56} rx={4} fill={accent} stroke={stroke} strokeWidth={2} strokeDasharray="6 4" />;
      case "bookshelf":
        return (
          <>
            <Rect x={14} y={36} width={72} height={28} fill={tone} stroke={stroke} strokeWidth={2} />
            <Rect x={38} y={36} width={2} height={28} fill={stroke} />
            <Rect x={60} y={36} width={2} height={28} fill={stroke} />
          </>
        );
      case "tv_stand":
        return (
          <>
            <Rect x={10} y={38} width={80} height={24} rx={3} fill={tone} stroke={stroke} strokeWidth={2} />
            <Rect x={28} y={44} width={44} height={4} fill={c.surfaceInverse} />
          </>
        );
      default:
        return <Rect x={16} y={28} width={68} height={44} rx={category === "coffee_table" ? 10 : 3} fill={tone} stroke={stroke} strokeWidth={2} />;
    }
  };
  return (
    <View testID={testID} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.brandTertiary, overflow: "hidden" }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        {shape()}
      </Svg>
    </View>
  );
}
