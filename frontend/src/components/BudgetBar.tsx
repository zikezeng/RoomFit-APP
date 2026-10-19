import React from "react";
import { Text, View } from "react-native";

import { money } from "@/src/components/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function BudgetBar({ total, budget }: { total: number; budget: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const remaining = budget - total;
  return (
    <View style={{ gap: 6 }} testID="budget-bar">
      <View style={s.row}>
        <Text style={s.k}>
          Total <Text style={s.v} testID="budget-bar-total">{money(total)}</Text> of {money(budget)}
        </Text>
        <Text style={[s.k, { color: remaining >= 0 ? colors.success : colors.error, fontWeight: "700" }]} testID="budget-bar-remaining">
          {money(remaining)} left
        </Text>
      </View>
      <View style={s.bar}>
        <View style={[s.fill, { width: `${Math.min(100, (total / budget) * 100)}%`, backgroundColor: remaining >= 0 ? colors.brandPrimary : colors.error }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  k: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  v: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.onSurface },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
}));
