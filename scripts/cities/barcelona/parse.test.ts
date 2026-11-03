// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBarcelonaCsv, loadBarris, parseBarcelonaCsv } from './parse';

const sample = readFileSync(new URL('./fixtures/trams-sample.csv', import.meta.url));
const barris = loadBarris(
  JSON.parse(
    readFileSync(
      new URL('../../../public/data/barcelona/barrios.geojson', import.meta.url),
      'utf8',
    ),
  ),
);
const text = decodeBarcelonaCsv(new Uint8Array(sample));
const parse = (csv: string) => parseBarcelonaCsv(csv, barris);
const byId = (id: string) => {
  const s = parse(text).find((x) => x.id === id);
  if (!s) throw new Error(`no stretch ${id}`);
  return s;
};

describe('parseBarcelonaCsv', () => {
  it('makes one stretch per ID_TRAM, not per row', () => {
    // 17 data rows: tram 19 has 3 pieces, 22 has 5, 492 has 2; 8448 is skipped.
    expect(parse(text)).toHaveLength(9);
  });

  it('counts the places of a multi-piece tram once', () => {
    expect(byId('barcelona-22').spaces).toBe(21);
    expect(byId('barcelona-19').spaces).toBe(8);
  });

  it('puts a multi-piece tram on one of its own pieces', () => {
    const s = byId('barcelona-22');
    expect(s.lat).toBeGreaterThan(41.3881);
    expect(s.lat).toBeLessThan(41.3895);
    expect(s.lng).toBeGreaterThan(2.1804);
    expect(s.lng).toBeLessThan(2.1808);
  });

  it('maps tram types to zone kinds', () => {
    expect(byId('barcelona-7').kind).toBe('visitor'); // AZL
    expect(byId('barcelona-19').kind).toBe('resident'); // VM
    expect(byId('barcelona-22').kind).toBe('resident'); // VR
    expect(byId('barcelona-8507').kind).toBe('other'); // DUM
    expect(byId('barcelona-6819').kind).toBe('other'); // BUS
  });

  it('skips the tariff-less monitoring record in the sea', () => {
    expect(parse(text).some((s) => s.id === 'barcelona-8448')).toBe(false);
  });

  it('assigns the barri containing the stretch', () => {
    expect(byId('barcelona-7').neighbourhood).toBe('el Fort Pienc');
    expect(byId('barcelona-559').neighbourhood).toBe('la Sagrada Família');
    expect(byId('barcelona-492').neighbourhood).toBe("la Nova Esquerra de l'Eixample");
  });

  it('formats streets, dropping the number, the 4th part and the code prefix', () => {
    expect(byId('barcelona-7').street).toBe('CARRER ROGER DE FLOR');
    expect(byId('barcelona-559').street).toBe('AVINGUDA GAUDI');
    expect(byId('barcelona-492').street).toBe('CARRER VILAMARI'); // "VILAMARI, Fte, 90, C"
    expect(byId('barcelona-11767').street).toBe('CARRER GRAN VISTA'); // "3444.- GRAN VISTA"
  });

  it('gives stable ids from the council tram id', () => {
    expect(parse(text).map((s) => s.id)).toEqual(parse(text).map((s) => s.id));
    expect(byId('barcelona-7').city).toBe('barcelona');
  });

  it('strips a BOM and reads quoted fields containing commas', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...sample.subarray(3)]);
    expect(parse(decodeBarcelonaCsv(withBom))).toHaveLength(9);
  });

  it('throws on an unknown TIPUS_TRAM', () => {
    expect(() => parse(text.replace('"VR"', '"XYZ"'))).toThrow(/unknown TIPUS_TRAM "XYZ"/);
  });

  it('throws when the pieces of a tram disagree on places', () => {
    const lines = text.split('\n');
    const i = lines.findIndex((l) => l.startsWith('22,'));
    lines[i] = lines[i].replace(/,21\r?$/, ',22');
    expect(() => parse(lines.join('\n'))).toThrow(/tram 22 disagree/);
  });

  it('throws on a missing column or a bad coordinate', () => {
    expect(() => parse(text.replace('PLACES', 'PLAZAS'))).toThrow(/missing column "places"/);
    expect(() => parse(text.replace('"41.393835137424"', '"abc"'))).toThrow(/invalid LATITUD_I/);
  });

  it('throws when a stretch is nowhere near any barri', () => {
    const far = text.replace('"41.393835137424"', '"41.6"').replace('"41.39383413787"', '"41.6"');
    expect(() => parse(far)).toThrow(/from every barri polygon/);
  });

  it('throws on an empty file', () => {
    expect(() => parse('')).toThrow(/empty/);
  });
});
