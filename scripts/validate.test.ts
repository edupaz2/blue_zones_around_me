import { describe, expect, it } from 'vitest';
import { validateStretches } from './validate';
import type { BBox, Stretch } from '../src/core/types';

const bounds: BBox = [-3.9, 40.3, -3.5, 40.6];

const mk = (id: string, lat = 40.42, lng = -3.7): Stretch => ({
  id,
  city: 'madrid',
  neighbourhood: 'Sol',
  street: 'Calle X',
  kind: 'visitor',
  spaces: 5,
  lat,
  lng,
});

const many = (n: number): Stretch[] => Array.from({ length: n }, (_, i) => mk(`s${i}`));

describe('validateStretches', () => {
  it('passes on good data', () => {
    expect(() => validateStretches(many(10), bounds, 10)).not.toThrow();
  });

  it('throws on out-of-bounds coordinate, naming the stretch', () => {
    expect(() => validateStretches([mk('ok'), mk('far', 41.5, -3.7)], bounds, null)).toThrow(/far/);
  });

  it('throws on NaN coordinate', () => {
    expect(() => validateStretches([mk('nan', NaN, -3.7)], bounds, null)).toThrow(/nan/);
  });

  it('throws on missing coordinate', () => {
    const bad = { ...mk('miss'), lng: undefined } as unknown as Stretch;
    expect(() => validateStretches([bad], bounds, null)).toThrow(/miss/);
  });

  it('throws when count is more than 20% below previous', () => {
    expect(() => validateStretches(many(79), bounds, 100)).toThrow(/79.*100/);
  });

  it('passes at exactly 20% lower', () => {
    expect(() => validateStretches(many(80), bounds, 100)).not.toThrow();
  });

  it('skips the count check when previousCount is null', () => {
    expect(() => validateStretches(many(1), bounds, null)).not.toThrow();
  });
});
