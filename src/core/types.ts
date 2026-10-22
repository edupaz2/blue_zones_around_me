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
  | { type: 'tick'; now: number };
