import { describe, expect, it } from 'vitest';
import { inBounds } from './bounds';

const bounds: [number, number, number, number] = [-3.8, 40.3, -3.5, 40.55];

describe('inBounds', () => {
  it('accepts a point inside', () => {
    expect(inBounds({ lat: 40.4, lng: -3.7 }, bounds)).toBe(true);
  });
  it('rejects a point outside', () => {
    expect(inBounds({ lat: 41.38, lng: 2.17 }, bounds)).toBe(false);
  });
  it('accepts points on the edge', () => {
    expect(inBounds({ lat: 40.3, lng: -3.8 }, bounds)).toBe(true);
    expect(inBounds({ lat: 40.55, lng: -3.5 }, bounds)).toBe(true);
  });
  it('rejects just beyond the edge', () => {
    expect(inBounds({ lat: 40.56, lng: -3.7 }, bounds)).toBe(false);
    expect(inBounds({ lat: 40.4, lng: -3.81 }, bounds)).toBe(false);
  });
});
