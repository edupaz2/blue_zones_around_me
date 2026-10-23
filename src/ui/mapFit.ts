import type { LatLng } from '../core/types';

/** Pure: bounding box [[west, south], [east, north]] of the points, or null if empty. */
export function boundsForPoints(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}
