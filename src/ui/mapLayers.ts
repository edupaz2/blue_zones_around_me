import type { Feature, FeatureCollection } from 'geojson';
import type { Settings, Stretch } from '../core/types';

/**
 * Pure: stretches -> GeoJSON points for the map. `other` is never emitted;
 * kinds are filtered by the settings toggles. Properties are identical in
 * shape for every kind: equal visibility is a layer-style concern.
 */
export function stretchesToGeoJson(
  stretches: Stretch[],
  settings: Settings,
  triedZoneStretchIds: Set<string>,
  highlightedStretchIds: Set<string>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const s of stretches) {
    if (s.kind === 'other') continue;
    if (s.kind === 'visitor' && !settings.showVisitor) continue;
    if (s.kind === 'resident' && !settings.showResident) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        kind: s.kind,
        tried: triedZoneStretchIds.has(s.id),
        highlighted: highlightedStretchIds.has(s.id),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
