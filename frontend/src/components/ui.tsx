import Feather from "@react-native-vector-icons/feather";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleProp, Text, TextProps, View, ViewStyle } from "react-native";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const tap = () => {
  if (Platform.OS !== "web") Haptics.selectionAsync();
};

export function Txt({ variant = "body", style, ...rest }: TextProps & { variant?: "display" | "title" | "body" | "caption" | "label" }) {
  const s = useStyles();
  return <Text {...rest} style={[s[variant], style]} />;
}

type BtnProps = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost";
  icon?: React.ComponentProps<typeof Feather>["name"];
  disabled?: boolean;
  testID: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ label, onPress, kind = "primary", icon, disabled, testID, style, small }: BtnProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const fg = kind === "primary" ? colors.onBrandPrimary : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, s[kind], disabled && { opacity: 0.4 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }, style]}
    >
      {icon ? <Feather name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={[s.btnLabel, small && { fontSize: 14 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[s.chip, selected && s.chipOn]}
    >
      <Text style={[s.chipLabel, selected && s.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useStyles();
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function Stepper({ value, min, max, onChange, testID }: { value: number; min: number; max: number; onChange: (v: number) => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.stepper}>
      <Pressable testID={`${testID}-minus`} disabled={value <= min} onPress={() => (tap(), onChange(value - 1))} style={[s.stepBtn, value <= min && { opacity: 0.35 }]}>
        <Feather name="minus" size={16} color={colors.onSurface} />
      </Pressable>
      <Text testID={`${testID}-value`} style={s.stepVal}>
        {value}
      </Text>
      <Pressable testID={`${testID}-plus`} disabled={value >= max} onPress={() => (tap(), onChange(value + 1))} style={[s.stepBtn, value >= max && { opacity: 0.35 }]}>
        <Feather name="plus" size={16} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

export function Notice({ tone = "info", text, testID }: { tone?: "info" | "error" | "success" | "warning"; text: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const c = colors[tone];
  const icon = tone === "error" ? "alert-circle" : tone === "success" ? "check-circle" : tone === "warning" ? "alert-triangle" : "info";
  return (
    <View testID={testID} style={[s.notice, { borderColor: c }]}>
      <Feather name={icon} size={16} color={c} style={{ marginTop: 2 }} />
      <Text style={s.noticeText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: c.onSurface, letterSpacing: -0.5 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: c.onSurface },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceTertiary },
  caption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 16, color: c.muted },
  label: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
  btn: { minHeight: 52, borderRadius: radius.pill, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  btnSmall: { minHeight: 40, paddingHorizontal: spacing.lg },
  primary: { backgroundColor: c.brandPrimary },
  secondary: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  ghost: { backgroundColor: "transparent" },
  btnLabel: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600" },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  chipLabel: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceTertiary, fontWeight: "500" },
  chipLabelOn: { color: c.onBrandTertiary },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, boxShadow: "0px 4px 12px rgba(28,27,26,0.06)" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  stepVal: { fontFamily: fonts.text, fontSize: 16, fontWeight: "600", minWidth: 20, textAlign: "center", color: c.onSurface },
  notice: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, backgroundColor: c.surfaceSecondary },
  noticeText: { flex: 1, fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.onSurfaceTertiary },
}));
