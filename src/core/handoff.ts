import type { LatLng } from './types';

/** Builds a deep link that opens turn-by-turn navigation to `point` in the chosen app. */
export function buildNavigationUrl(app: 'google' | 'waze', point: LatLng): string {
  if (app === 'google') {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
  }
  return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
}
