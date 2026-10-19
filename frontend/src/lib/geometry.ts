// Units & formatting helpers. Internal values are centimetres.
import { Unit } from "./types";

export const CM_PER_FT = 30.48;
export const toUnit = (cm: number, unit: Unit) => (unit === "m" ? cm / 100 : cm / CM_PER_FT);
export const fromUnit = (v: number, unit: Unit) => (unit === "m" ? v * 100 : v * CM_PER_FT);
export const fmtLen = (cm: number, unit: Unit) => (unit === "m" ? `${(cm / 100).toFixed(2)} m` : `${(cm / CM_PER_FT).toFixed(1)} ft`);
export const fmtAreaCm2 = (cm2: number, unit: Unit) => {
  const m2 = cm2 / 10000;
  return unit === "m" ? `${m2.toFixed(1)} m²` : `${(m2 * 10.7639).toFixed(0)} sq ft`;
};
