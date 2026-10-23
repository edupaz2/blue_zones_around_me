import { describe, expect, it } from 'vitest';
import { rankCandidates } from './ranking';
import type { CandidateZone, LatLng } from './types';

const origin: LatLng = { lat: 41.15, lng: -8.61 };
const M = 1 / 111320;
const options = { radiiM: [800, 1200, 1600, 2000], maxResults: 3 };

function zone(id: string, metresNorth: number, totalSpaces = 10): CandidateZone {
  const p = { lat: origin.lat + metresNorth * M, lng: origin.lng };
  return {
    id,
    city: 'Porto',
    neighbourhood: 'X',
    stretchIds: [id],
    streets: [id],
    totalSpaces,
    centroid: p,
    target: p,
  };
}

const ids = (r: { ranked: { zone: CandidateZone }[] }) => r.ranked.map((x) => x.zone.id);

describe('rankCandidates', () => {
  it('sorts by distance', () => {
    const r = rankCandidates(origin, [zone('c', 600), zone('a', 100), zone('b', 300)], [], options);
    expect(ids(r)).toEqual(['a', 'b', 'c']);
    expect(r.radiusM).toBe(800);
    expect(r.ranked[0].distanceM).toBeCloseTo(100, 0);
  });

  it('breaks distance ties by higher totalSpaces', () => {
    const r = rankCandidates(origin, [zone('small', 200, 5), zone('big', 200, 50)], [], options);
    expect(ids(r)).toEqual(['big', 'small']);
  });

  it('excludes tried ids', () => {
    const r = rankCandidates(origin, [zone('a', 100), zone('b', 200)], ['a'], options);
    expect(ids(r)).toEqual(['b']);
  });

  it('excludes zones beyond 800 m when 3 or more are found within it', () => {
    const r = rankCandidates(
      origin,
      [zone('a', 100), zone('b', 200), zone('c', 300), zone('far', 1000)],
      [],
      options,
    );
    expect(ids(r)).toEqual(['a', 'b', 'c']);
    expect(r.radiusM).toBe(800);
  });

  it('widens to 1.2 km when fewer than 3 are within 800 m', () => {
    const r = rankCandidates(
      origin,
      [zone('n', 100), zone('a', 1000), zone('b', 1100)],
      [],
      options,
    );
    expect(r.radiusM).toBe(1200);
    expect(ids(r)).toEqual(['n', 'a', 'b']);
  });

  it('widens to 1.6 km', () => {
    const r = rankCandidates(
      origin,
      [zone('n', 100), zone('a', 1000), zone('b', 1500)],
      [],
      options,
    );
    expect(r.radiusM).toBe(1600);
    expect(ids(r)).toEqual(['n', 'a', 'b']);
  });

  it('widens to 2 km and reports the widest radius with fewer than max results', () => {
    const r = rankCandidates(origin, [zone('n', 100), zone('a', 1900)], [], options);
    expect(r.radiusM).toBe(2000);
    expect(ids(r)).toEqual(['n', 'a']);
  });

  it('returns at most maxResults', () => {
    const zs = [1, 2, 3, 4, 5].map((i) => zone(`z${i}`, i * 50));
    expect(rankCandidates(origin, zs, [], options).ranked).toHaveLength(3);
  });

  it('returns nothing when no zone is within 2 km', () => {
    expect(rankCandidates(origin, [zone('far', 2500)], [], options)).toEqual({
      ranked: [],
      radiusM: null,
    });
  });

  it('returns nothing when all candidates are tried', () => {
    expect(rankCandidates(origin, [zone('a', 100), zone('b', 200)], ['a', 'b'], options)).toEqual({
      ranked: [],
      radiusM: null,
    });
  });
});
