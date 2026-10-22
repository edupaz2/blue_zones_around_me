import type { CityConfig } from '../../core/types';

// SER data extent (2026 file, WGS84): lat 40.3781..40.4895, lng -3.7423..-3.6415.
// Map bounds add ~1 km of margin. The geocoder box only biases/limits the
// Photon query; results outside `bounds` are still filtered out afterwards.
export const madridConfig: CityConfig = {
  id: 'madrid',
  name: 'Madrid',
  center: { lat: 40.416775, lng: -3.70379 }, // Puerta del Sol
  bounds: [-3.755, 40.369, -3.629, 40.499],
  geocoderBbox: [-3.802, 40.333, -3.582, 40.535],
  kinds: {
    visitor: { label: 'Zona azul', color: '#1565c0' }, // SER code 043000255
    resident: { label: 'Zona verde', color: '#2e7d32' }, // SER code 077214010
    other: { label: 'Otras zonas SER', color: '#8a8a8a' },
  },
  groupingRadiusM: 150,
  radiiM: [800, 1200, 1600, 2000],
  maxResults: 3,
};
