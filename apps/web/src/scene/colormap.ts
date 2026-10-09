import { Color } from "three";
import { palette } from "../theme";

const negative = new Color(palette.teal);
const neutral = new Color(palette.blueGray);
const positive = new Color(palette.yellow);

/**
 * Diverging colormap for a Wigner value normalized to [-1, 1]: teal for negative values (the
 * quantum signature), blue-gray at zero, yellow for positive values. Interpolates in linear RGB.
 */
export function divergingColor(normalized: number, target: Color): Color {
  const t = Math.max(-1, Math.min(1, normalized));
  return target.copy(neutral).lerp(t < 0 ? negative : positive, Math.abs(t));
}
