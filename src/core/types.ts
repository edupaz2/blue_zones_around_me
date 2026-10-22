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
