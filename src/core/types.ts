export type ZoneKind = 'visitor' | 'resident' | 'other';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Stretch {
  id: string;
  city: string;
  neighbourhood: string;
  street: string;
  kind: ZoneKind;
  spaces: number;
  lat: number;
  lng: number;
}

/** [west, south, east, north] in WGS84 degrees. */
export type BBox = [west: number, south: number, east: number, north: number];

export interface CityConfig {
  id: string;
  name: string;
  /** IANA time zone the city's regulated hours run in. */
  timeZone: string;
  /** Name of the regulated parking area as the UI shows it, per language. */
  area: { en: string; es: string };
  /** Map credits for the barrio layer, and for the meter layer (null: city has no meter layer). */
  attribution: { barrios: string; meters: string | null };
  /** Whether a "usual availability" estimate (busyness.json) is published for the city. */
  hasBusyness: boolean;
  center: LatLng;
  bounds: BBox;
  geocoderBbox: BBox;
  kinds: Record<ZoneKind, { label: string; color: string }>;
  groupingRadiusM: number;
  radiiM: number[];
  maxResults: number;
}

export interface CandidateZone {
  id: string;
  city: string;
  neighbourhood: string;
  stretchIds: string[];
  streets: string[];
  totalSpaces: number;
  centroid: LatLng;
  target: LatLng;
}

export interface Settings {
  showVisitor: boolean;
  showResident: boolean;
  navApp: 'google' | 'waze' | null;
}

export interface Origin {
  mode: 'destination' | 'around';
  point: LatLng;
  label?: string;
}

export interface SessionState {
  status: 'idle' | 'choosing' | 'driving';
  origin: Origin | null;
  zoneId: string | null;
  tried: string[];
  lastActivityAt: number;
}

export type SessionAction =
  | { type: 'start'; origin: Origin; now: number }
  | { type: 'go'; zoneId: string; now: number }
  | { type: 'found'; now: number }
  | { type: 'next'; now: number; origin?: Origin }
  | { type: 'cancel'; now: number }
  | { type: 'dismiss'; now: number }
  | { type: 'relabel'; point: LatLng; label: string; now: number }
  | { type: 'tick'; now: number };
