import { haversineM } from './geo';
import type { CandidateZone, LatLng } from './types';

export interface RankOptions {
  radiiM: number[];
  maxResults: number;
}

export interface Ranked {
  zone: CandidateZone;
  distanceM: number;
}

export interface RankResult {
  ranked: Ranked[];
  radiusM: number | null;
}

/**
 * Ranks untried candidates by straight-line distance from the origin, widening
 * the search radius step by step until enough results are found.
 */
export function rankCandidates(
  origin: LatLng,
  candidates: CandidateZone[],
  triedIds: readonly string[],
  options: RankOptions,
): RankResult {
  const tried = new Set(triedIds);
  const untried: Ranked[] = candidates
    .filter((zone) => !tried.has(zone.id))
    .map((zone) => ({ zone, distanceM: haversineM(origin, zone.target) }))
    .sort((a, b) => a.distanceM - b.distanceM || b.zone.totalSpaces - a.zone.totalSpaces);

  let found: Ranked[] = [];
  let radiusM: number | null = null;
  for (const radius of options.radiiM) {
    const within = untried.filter((r) => r.distanceM <= radius);
    if (within.length > 0) {
      found = within;
      radiusM = radius;
    }
    if (within.length >= options.maxResults) break;
  }
  return { ranked: found.slice(0, options.maxResults), radiusM };
}
