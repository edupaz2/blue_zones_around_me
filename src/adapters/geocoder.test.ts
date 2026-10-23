import { describe, expect, it, vi } from 'vitest';
import { madridConfig } from '../cities/madrid/config';
import { reversePlace, searchPlaces } from './geocoder';

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

describe('reversePlace', () => {
  const point = { lat: 40.416863, lng: -3.7038762 };

  it('calls the Photon reverse endpoint with lon, lat and limit (no lang)', async () => {
    const f = okFetch([]);
    await reversePlace(point, asFetch(f));
    const url = new URL(f.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/reverse');
    expect(url.searchParams.get('lon')).toBe('-3.7038762');
    expect(url.searchParams.get('lat')).toBe('40.416863');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.has('lang')).toBe(false);
  });

  it('builds the label from the feature properties', async () => {
    const f = okFetch([
      feature(-3.7038762, 40.416863, {
        name: 'Puerta del Sol',
        locality: 'Barrio de los Austrias',
        district: 'Centro',
        city: 'Madrid',
        postcode: '28013',
      }),
    ]);
    expect(await reversePlace(point, asFetch(f))).toBe('Puerta del Sol, Centro, Madrid');
  });

  it('returns null without features', async () => {
    expect(await reversePlace(point, asFetch(okFetch([])))).toBeNull();
  });

  it('returns null for a feature without a usable label', async () => {
    const f = okFetch([feature(-3.7, 40.4, { postcode: '28013', countrycode: 'ES' })]);
    expect(await reversePlace(point, asFetch(f))).toBeNull();
  });

  it('returns null on HTTP errors', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await reversePlace(point, asFetch(f))).toBeNull();
  });

  it('returns null on network errors', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(await reversePlace(point, asFetch(f))).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    });
    expect(await reversePlace(point, asFetch(f))).toBeNull();
  });

  // A fetch stub that rejects like the real one when its signal aborts.
  const abortAware = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
      }),
  );

  it('returns null when the caller aborts', async () => {
    const ctl = new AbortController();
    const p = reversePlace(point, asFetch(abortAware), { signal: ctl.signal });
    ctl.abort();
    expect(await p).toBeNull();
  });

  it('returns null when already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    expect(await reversePlace(point, asFetch(abortAware), { signal: ctl.signal })).toBeNull();
  });

  it('returns null after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const p = reversePlace(point, asFetch(abortAware), { timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to a 4 s timeout', async () => {
    vi.useFakeTimers();
    try {
      const p = reversePlace(point, asFetch(abortAware));
      await vi.advanceTimersByTimeAsync(3999);
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
