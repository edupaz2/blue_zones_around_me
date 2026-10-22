import { describe, expect, it } from 'vitest';
import type { Stretch } from '../src/core/types';
import { groupVisitorStretches } from './group';

const M = 1 / 111195; // degrees of latitude per metre
const BASE = { lat: 40.4, lng: -3.7 };

function s(id: string, northM: number, over: Partial<Stretch> = {}): Stretch {
  return {
    id,
    city: 'madrid',
    neighbourhood: 'Sol',
    street: `Calle ${id}`,
    kind: 'visitor',
    spaces: 10,
    lat: BASE.lat + northM * M,
    lng: BASE.lng,
    ...over,
  };
}

const group = (xs: Stretch[]) => groupVisitorStretches(xs, 'madrid', 150);

describe('groupVisitorStretches', () => {
  it('merges two stretches 100 m apart', () => {
    expect(group([s('a', 0), s('b', 100)])).toHaveLength(1);
  });

  it('chains via single linkage (A-B 100, B-C 100, A-C 200)', () => {
    const zones = group([s('a', 0), s('b', 100), s('c', 200)]);
    expect(zones).toHaveLength(1);
    expect(zones[0].stretchIds).toEqual(['a', 'b', 'c']);
  });

  it('keeps stretches 200 m apart in separate zones', () => {
    expect(group([s('a', 0), s('b', 200)])).toHaveLength(2);
  });

  it('does not merge across neighbourhoods', () => {
    const zones = group([s('a', 0), s('b', 100, { neighbourhood: 'Centro' })]);
    expect(zones).toHaveLength(2);
  });

  it('ignores resident and other stretches', () => {
    const zones = group([
      s('a', 0),
      s('b', 50, { kind: 'resident' }),
      s('c', 60, { kind: 'other' }),
    ]);
    expect(zones).toHaveLength(1);
    expect(zones[0].stretchIds).toEqual(['a']);
  });

  it('sums spaces and lists unique sorted streets', () => {
    const [z] = group([
      s('a', 0, { spaces: 3, street: 'Mayor' }),
      s('b', 50, { spaces: 4, street: 'Alcala' }),
      s('c', 90, { spaces: 5, street: 'Mayor' }),
    ]);
    expect(z.totalSpaces).toBe(12);
    expect(z.streets).toEqual(['Alcala', 'Mayor']);
    expect(z.city).toBe('madrid');
    expect(z.neighbourhood).toBe('Sol');
  });

  it('computes centroid as the mean of member coordinates', () => {
    const [z] = group([s('a', 0), s('b', 100)]);
    expect(z.centroid.lat).toBeCloseTo(BASE.lat + 50 * M, 9);
    expect(z.centroid.lng).toBeCloseTo(BASE.lng, 9);
  });

  it('targets the max-spaces stretch among those nearest the centroid, at real coordinates', () => {
    const stretches = [
      s('a', 0, { spaces: 50 }),
      s('b', 100, { spaces: 1 }),
      s('c', 200, { spaces: 40 }),
    ];
    const [z] = group(stretches);
    // Only the closest ceil(3/3)=1 stretch (b) is considered.
    expect(z.target).toEqual({ lat: stretches[1].lat, lng: stretches[1].lng });
    expect(stretches.some((x) => x.lat === z.target.lat && x.lng === z.target.lng)).toBe(true);
  });

  it('breaks target ties by stretch id', () => {
    const a = s('a', 0, { spaces: 5, lng: BASE.lng + 0.0001 });
    const b = s('b', 0, { spaces: 5, lng: BASE.lng - 0.0001 });
    const [z] = group([b, a]);
    // Equidistant from the centroid with equal spaces: lowest id (a) wins.
    expect(z.target).toEqual({ lat: a.lat, lng: a.lng });
  });

  it('produces a stable id regardless of input order', () => {
    const xs = [s('a', 0), s('b', 100), s('c', 1000)];
    const one = group(xs);
    const two = group([...xs].reverse());
    expect(two).toEqual(one);
    expect(one[0].id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('drops zones with zero total spaces', () => {
    const zones = group([
      s('a', 0, { spaces: 0 }),
      s('b', 50, { spaces: 0 }),
      s('c', 1000, { spaces: 4 }),
    ]);
    expect(zones).toHaveLength(1);
    expect(zones[0].stretchIds).toEqual(['c']);
  });
});
