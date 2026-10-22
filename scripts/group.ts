import { createHash } from 'node:crypto';
import { haversineM } from '../src/core/geo';
import type { CandidateZone, LatLng, Stretch } from '../src/core/types';

const M_PER_DEG_LAT = 111195;

const byId = (a: Stretch, b: Stretch): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Single-linkage clusters (union-find) of one neighbourhood's stretches.
 * Sorted by latitude so each stretch is only compared with those within
 * `radiusM` of it in latitude (sweep window), avoiding a full O(n^2).
 */
function cluster(stretches: Stretch[], radiusM: number): Stretch[][] {
  const sorted = [...stretches].sort((a, b) => a.lat - b.lat || byId(a, b));
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  // Small safety margin: haversine and the flat lat conversion differ slightly.
  const latWindow = (radiusM * 1.01) / M_PER_DEG_LAT;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].lat - sorted[i].lat > latWindow) break;
      if (haversineM(sorted[i], sorted[j]) <= radiusM) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map<number, Stretch[]>();
  sorted.forEach((st, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(st);
    else groups.set(root, [st]);
  });
  return [...groups.values()];
}

/**
 * Target selection rule: sort members by distance to the centroid (ties by
 * id), keep the closest ceil(n / 3) (at least 1), then pick the one with the
 * most spaces (ties by lowest id). The result is always a real stretch.
 */
function pickTarget(members: Stretch[], centroid: LatLng): LatLng {
  const ranked = members
    .map((m) => ({ m, d: haversineM(m, centroid) }))
    .sort((a, b) => a.d - b.d || byId(a.m, b.m));
  const keep = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
  const best = keep.map((k) => k.m).sort((a, b) => b.spaces - a.spaces || byId(a, b))[0];
  return { lat: best.lat, lng: best.lng };
}

export function groupVisitorStretches(
  stretches: Stretch[],
  city: string,
  groupingRadiusM: number,
): CandidateZone[] {
  const byHood = new Map<string, Stretch[]>();
  for (const s of stretches) {
    if (s.kind !== 'visitor') continue;
    const list = byHood.get(s.neighbourhood);
    if (list) list.push(s);
    else byHood.set(s.neighbourhood, [s]);
  }

  const zones: CandidateZone[] = [];
  for (const [neighbourhood, list] of byHood) {
    for (const members of cluster(list, groupingRadiusM)) {
      const totalSpaces = members.reduce((n, m) => n + m.spaces, 0);
      if (totalSpaces <= 0) continue;
      const stretchIds = members.map((m) => m.id).sort();
      const centroid: LatLng = {
        lat: members.reduce((n, m) => n + m.lat, 0) / members.length,
        lng: members.reduce((n, m) => n + m.lng, 0) / members.length,
      };
      const id = createHash('sha1')
        .update(`${city}|${neighbourhood}|${stretchIds.join(',')}`)
        .digest('hex')
        .slice(0, 12);
      zones.push({
        id,
        city,
        neighbourhood,
        stretchIds,
        streets: [...new Set(members.map((m) => m.street))].sort(),
        totalSpaces,
        centroid,
        target: pickTarget(members, centroid),
      });
    }
  }
  return zones.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
