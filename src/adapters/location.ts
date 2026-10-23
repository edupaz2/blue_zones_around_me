import type { LatLng } from '../core/types';

export interface Position {
  point: LatLng;
  accuracyM: number;
}
export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

const PERMISSION_DENIED = 1;

export function watchLocation(
  onPosition: (p: Position) => void,
  onStatus: (s: LocationStatus) => void,
): () => void {
  const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
  if (!geo) {
    onStatus('unavailable');
    return () => {};
  }
  const id = geo.watchPosition(
    (pos) => {
      onStatus('granted');
      onPosition({
        point: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        accuracyM: pos.coords.accuracy,
      });
    },
    (err) => onStatus(err.code === PERMISSION_DENIED ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true },
  );
  return () => geo.clearWatch(id);
}
