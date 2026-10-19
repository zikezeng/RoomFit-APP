// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F9F8F4",
  onSurface: "#1C1B1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1B1A",
  surfaceTertiary: "#EAE6DF",
  onSurfaceTertiary: "#3D3B38",
  surfaceInverse: "#2A2928",
  onSurfaceInverse: "#F9F8F4",
  muted: "#7A756D",
  brand: "#A3B19B",
  onBrand: "#FFFFFF",
  brandPrimary: "#6F7F67",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#C1CBB8",
  onBrandSecondary: "#1C1B1A",
  brandTertiary: "#E5E8E1",
  onBrandTertiary: "#2E362A",
  success: "#5E8A5C",
  onSuccess: "#FFFFFF",
  warning: "#B5874A",
  onWarning: "#FFFFFF",
  error: "#B85C50",
  onError: "#FFFFFF",
  info: "#7B8B9E",
  onInfo: "#FFFFFF",
  border: "#E1DDD4",
  borderStrong: "#B8B1A4",
  divider: "#EAE6DF",
  scrim: "rgba(28,27,26,0.55)",
  wood: "#D9C7AE",
  woodDark: "#A88B6A",
  // Room segmentation fills (used with transparency over the uploaded plan)
  roomLiving: "#9CC3E0",
  roomBedroom: "#A3B19B",
  roomKitchen: "#E3CFA8",
  roomBathroom: "#BDBDBD",
  roomCloset: "#C7B8E3",
  roomBalcony: "#F0DE8A",
  roomOther: "#D9C7AE",
};

export const fonts = { display: "Fraunces", text: "DMSans" };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}


