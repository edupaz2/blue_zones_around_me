import type { CityConfig } from '../../core/types';

// Àrea Blava/Verda data extent (2026-3T file, WGS84): lat 41.3496..41.4523,
// lng 2.1035..2.2208. Map bounds add ~1 km of margin. The geocoder box only
// biases/limits the Photon query; results outside `bounds` are still filtered
// out afterwards.
export const barcelonaConfig: CityConfig = {
  id: 'barcelona',
  name: 'Barcelona',
  timeZone: 'Europe/Madrid',
  area: {
    en: 'Barcelona regulated parking area',
    es: 'de la zona de aparcamiento regulado de Barcelona',
  },
  attribution: { barrios: 'Barris: Ajuntament de Barcelona', meters: null },
  hasBusyness: false,
  center: { lat: 41.387, lng: 2.17 }, // Plaça de Catalunya
  bounds: [2.089, 41.337, 2.235, 41.465],
  geocoderBbox: [2.05, 41.31, 2.24, 41.47],
  kinds: {
    visitor: { label: 'Àrea blava', color: '#0d3c8a' }, // TIPUS_TRAM AZL
    resident: { label: 'Àrea verda', color: '#2e7d32' }, // TIPUS_TRAM VM (mixed) and VR (residents only)
    other: { label: 'Altres zones', color: '#8a8a8a' },
  },
  groupingRadiusM: 150,
  radiiM: [800, 1200, 1600, 2000],
  maxResults: 3,
};
