import { inBounds } from '../core/bounds';
import type { CityConfig, LatLng } from '../core/types';

export interface GeoResult {
  label: string;
  point: LatLng;
}

const PHOTON_URL = 'https://photon.komoot.io/api/';

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: Record<string, string | undefined>;
}

function buildLabel(p: Record<string, string | undefined>): string {
  const street = p.street ? (p.housenumber ? `${p.street} ${p.housenumber}` : p.street) : undefined;
  const head = p.name ?? street;
  const parts = [head, p.district, p.city].filter((s): s is string => !!s);
  return parts.filter((s, i) => parts.indexOf(s) === i).join(', ');
}

export async function searchPlaces(
  query: string,
  city: CityConfig,
  fetchFn: typeof fetch = fetch,
): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    limit: '5',
    bbox: city.geocoderBbox.join(','),
    lang: 'es',
  });
  const res = await fetchFn(`${PHOTON_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const f of body.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const point = { lat: c[1], lng: c[0] };
    if (!inBounds(point, city.bounds)) continue;
    const label = buildLabel(f.properties ?? {});
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, point });
  }
  return out;
}
