// The dataset's own wagon wheel geometry, ported from cricket_pipeline/directions.py.
// This is the only place that works out zones, distances and the ring. Charts import it and never re-derive it.

const SCALE = 363 / 171;

/** Centre and radius of the field circle in the 363 by 363 data frame. */
export const FIELD_CENTRE = { x: 85.35 * SCALE, y: 85.35 * SCALE } as const;
export const FIELD_RADIUS = 85 * SCALE;
/** Where every shot line starts: the batter, above the centre (bowler at the bottom of the frame). */
export const BATTER = { x: 85.4 * SCALE, y: 73.63 * SCALE } as const;
/** The eight 45 degree zones are cut around this point, not around the field centre. */
export const ZONE_CENTRE = { x: 180, y: 165 } as const;
/** The 30 yard ring is a stadium shape (a rectangle with fully rounded ends), not a circle. */
export const RING = { centreY: 85.58 * SCALE, halfWidth: 33.6909 * SCALE, halfHeight: 45.0474 * SCALE } as const;

export type Hand = 'R' | 'L';

/** Zone 1 to 8, counted clockwise from straight behind the batter. A ball exactly on a border goes to the earlier zone. */
export function zoneOf(x: number, y: number): number {
  const angle = Math.round((((Math.atan2(x - ZONE_CENTRE.x, ZONE_CENTRE.y - y) * 180) / Math.PI) % 360 + 360) % 360 * 1e9) / 1e9;
  return ((Math.ceil(angle / 45) - 1) % 8 + 8) % 8 + 1;
}

/** Distance from the field centre as a share of the way to the boundary. Above 1 means past the rope. */
export function boundaryFraction(x: number, y: number): number {
  return Math.hypot(x - FIELD_CENTRE.x, y - FIELD_CENTRE.y) / FIELD_RADIUS;
}

export function insideRing(x: number, y: number): boolean {
  const dx = Math.abs(x - FIELD_CENTRE.x);
  const dy = Math.abs(y - RING.centreY);
  const straightHalf = RING.halfHeight - RING.halfWidth;
  if (dx > RING.halfWidth) return false;
  if (dy <= straightHalf) return true;
  return Math.hypot(dx, dy - straightHalf) <= RING.halfWidth;
}

const RIGHT_HAND_ZONE_NAMES = ['Fine leg', 'Square leg', 'Mid wicket', 'Mid on', 'Mid off', 'Cover', 'Point', 'Third man'] as const;

/** Names follow the right-hand view. For a left-hander the raw coordinates stay on the true ground and only the name changes (zone k reads as 9 minus k). */
export function zoneName(zone: number, hand: Hand): string {
  const index = (hand === 'L' ? 9 - zone : zone) - 1;
  const name = RIGHT_HAND_ZONE_NAMES[index];
  if (!name) throw new RangeError(`zone must be 1 to 8, got ${zone}`);
  return name;
}
