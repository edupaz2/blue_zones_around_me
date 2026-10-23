import { describe, expect, it, vi } from 'vitest';
import { madridConfig } from '../cities/madrid/config';
import { searchPlaces } from './geocoder';

function feature(lng: number, lat: number, properties: Record<string, string>) {
  return { geometry: { coordinates: [lng, lat] }, properties };
}
function okFetch(features: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ type: 'FeatureCollection', features }),
  });
}
const asFetch = (f: unknown) => f as typeof fetch;

describe('searchPlaces', () => {
  it('builds a Photon URL with q, limit and bbox (no lang)', async () => {
    const f = okFetch([]);
    await searchPlaces('Plaza Mayor', madridConfig, asFetch(f));
    const url = new URL(f.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    expect(url.searchParams.get('q')).toBe('Plaza Mayor');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('lang')).toBe(false);
    expect(url.searchParams.get('bbox')).toBe(madridConfig.geocoderBbox.join(','));
  });

  it('maps features to GeoResult', async () => {
    const f = okFetch([
      feature(-3.7, 40.4, { name: 'Plaza Mayor', district: 'Centro', city: 'Madrid' }),
      feature(-3.71, 40.41, { street: 'Calle Alcalá', housenumber: '10', city: 'Madrid' }),
    ]);
    const r = await searchPlaces('x', madridConfig, asFetch(f));
    expect(r).toEqual([
      { label: 'Plaza Mayor, Centro, Madrid', point: { lat: 40.4, lng: -3.7 } },
      { label: 'Calle Alcalá 10, Madrid', point: { lat: 40.41, lng: -3.71 } },
    ]);
  });

  it('returns [] for no features', async () => {
    expect(await searchPlaces('zzz', madridConfig, asFetch(okFetch([])))).toEqual([]);
  });

  it('returns [] without fetching for a blank query', async () => {
    const f = okFetch([]);
    expect(await searchPlaces('   ', madridConfig, asFetch(f))).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects on non-OK response', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(searchPlaces('x', madridConfig, asFetch(f))).rejects.toThrow();
  });

  it('rejects on network error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(searchPlaces('x', madridConfig, asFetch(f))).rejects.toThrow();
  });

  it('drops results outside the city bounds (Barcelona)', async () => {
    const f = okFetch([
      feature(2.17, 41.38, { name: 'Plaça Catalunya', city: 'Barcelona' }),
      feature(-3.7, 40.4, { name: 'Sol', city: 'Madrid' }),
    ]);
    const r = await searchPlaces('plaza', madridConfig, asFetch(f));
    expect(r.map((x) => x.label)).toEqual(['Sol, Madrid']);
  });

  it('deduplicates identical labels', async () => {
    const f = okFetch([
      feature(-3.7, 40.4, { name: 'Sol', city: 'Madrid' }),
      feature(-3.701, 40.401, { name: 'Sol', city: 'Madrid' }),
    ]);
    expect(await searchPlaces('sol', madridConfig, asFetch(f))).toHaveLength(1);
  });
});
