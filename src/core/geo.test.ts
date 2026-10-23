import { describe, expect, it } from 'vitest';
import { haversineM } from './geo';

const sol = { lat: 40.4169, lng: -3.7035 };
const cibeles = { lat: 40.4193, lng: -3.6932 };

describe('haversineM', () => {
  it('Puerta del Sol to Cibeles is about 900 m', () => {
    expect(Math.abs(haversineM(sol, cibeles) - 900)).toBeLessThanOrEqual(30);
  });
  it('same point is 0', () => {
    expect(haversineM(sol, sol)).toBe(0);
  });
  it('is symmetric', () => {
    expect(haversineM(sol, cibeles)).toBeCloseTo(haversineM(cibeles, sol), 9);
  });
});
