import { describe, expect, it } from 'vitest';
import { boundsForPoints } from './mapFit';

describe('boundsForPoints', () => {
  it('returns null for no points', () => {
    expect(boundsForPoints([])).toBeNull();
  });
  it('returns a degenerate box for a single point', () => {
    expect(boundsForPoints([{ lat: 40.4, lng: -3.7 }])).toEqual([
      [-3.7, 40.4],
      [-3.7, 40.4],
    ]);
  });
  it('spans several points', () => {
    expect(
      boundsForPoints([
        { lat: 40.4, lng: -3.7 },
        { lat: 40.5, lng: -3.6 },
        { lat: 40.3, lng: -3.8 },
      ]),
    ).toEqual([
      [-3.8, 40.3],
      [-3.6, 40.5],
    ]);
  });
});
