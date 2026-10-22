import type { CityConfig, LatLng } from './types';

export function inBounds(p: LatLng, bounds: CityConfig['bounds']): boolean {
  const [west, south, east, north] = bounds;
  return p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north;
}
