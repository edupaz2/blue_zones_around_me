import { describe, expect, it } from 'vitest';
import type { Settings, Stretch, ZoneKind } from '../core/types';
import { stretchesToGeoJson } from './mapLayers';

const mk = (id: string, kind: ZoneKind): Stretch => ({
  id,
  city: 'madrid',
  neighbourhood: 'Centro',
  street: 'CALLE X',
  kind,
  spaces: 5,
  lat: 40.41,
  lng: -3.7,
});
const stretches = [mk('v', 'visitor'), mk('r', 'resident'), mk('o', 'other')];
const both: Settings = { showVisitor: true, showResident: true, navApp: null };
const none = new Set<string>();
const kinds = (s: Settings) =>
  stretchesToGeoJson(stretches, s, none, none).features.map((f) => f.properties?.kind);

describe('stretchesToGeoJson', () => {
  it('shows visitor and resident but never other', () => {
    expect(kinds(both)).toEqual(['visitor', 'resident']);
  });
  it('omits resident when showResident is false', () => {
    expect(kinds({ ...both, showResident: false })).toEqual(['visitor']);
  });
  it('omits visitor when showVisitor is false', () => {
    expect(kinds({ ...both, showVisitor: false })).toEqual(['resident']);
  });
  it('flags tried and highlighted stretches', () => {
    const fc = stretchesToGeoJson(stretches, both, new Set(['v']), new Set(['r']));
    expect(fc.features[0]!.properties).toEqual({
      kind: 'visitor',
      tried: true,
      highlighted: false,
    });
    expect(fc.features[1]!.properties).toEqual({
      kind: 'resident',
      tried: false,
      highlighted: true,
    });
  });
  it('gives both kinds the same property keys (equal visibility)', () => {
    const fc = stretchesToGeoJson(stretches, both, none, none);
    const keys = fc.features.map((f) => Object.keys(f.properties!).sort().join());
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('highlighted,kind,tried');
  });
  it('emits Point geometries as [lng, lat]', () => {
    const f = stretchesToGeoJson(stretches, both, none, none).features[0]!;
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-3.7, 40.41] });
  });
});
