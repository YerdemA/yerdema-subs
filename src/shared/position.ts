// Pure helpers for drag-to-reposition of the subtitle box.
import { LIMITS } from './settings';

/**
 * Converts the box's bottom edge (client Y) into the `bottomOffset` setting: percent of the
 * overlay height measured from the overlay's bottom edge. Clamped and rounded to 0.5%.
 */
export function bottomOffsetFromDrag(
  overlayTop: number,
  overlayHeight: number,
  boxBottomY: number,
): number {
  const { min, max } = LIMITS.bottomOffset;
  if (!(overlayHeight > 0)) return min;
  const pct = ((overlayTop + overlayHeight - boxBottomY) / overlayHeight) * 100;
  const rounded = Math.round(pct * 2) / 2;
  return Math.min(max, Math.max(min, rounded));
}
