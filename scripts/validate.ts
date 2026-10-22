import type { CityConfig, Stretch } from '../src/core/types';

/** Max tolerated drop in row count versus the previously committed data. */
const MAX_DROP = 0.2;

/**
 * Fails loudly (throws) on missing/NaN/out-of-bounds coordinates, or when the
 * row count is more than 20% below `previousCount` (exactly 20% passes).
 * `previousCount === null` skips the count check.
 */
export function validateStretches(
  stretches: Stretch[],
  bounds: CityConfig['bounds'],
  previousCount: number | null,
): void {
  const [west, south, east, north] = bounds;
  for (const s of stretches) {
    const { lat, lng } = s;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      throw new Error(
        `Stretch ${s.id}: missing or non-numeric coordinate (lat=${lat}, lng=${lng})`,
      );
    }
    if (lng < west || lng > east || lat < south || lat > north) {
      throw new Error(
        `Stretch ${s.id}: coordinate (${lat}, ${lng}) outside bounds [${bounds.join(', ')}]`,
      );
    }
  }
  if (previousCount !== null && stretches.length < previousCount * (1 - MAX_DROP)) {
    throw new Error(
      `Row count dropped too much: ${stretches.length} now vs ${previousCount} previously (more than ${MAX_DROP * 100}% lower)`,
    );
  }
}
