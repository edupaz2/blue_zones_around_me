// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { haversineM } from '../../../src/core/geo';
import { decodeMadridCsv, parseMadridCsv } from './parse';

// Real rows from the 2026 SER file, raw bytes (ISO-8859-1, ';', CRLF).
const fixtureBytes = readFileSync(new URL('./fixtures/ser-sample.csv', import.meta.url));
const fixtureText = decodeMadridCsv(fixtureBytes);
const stretches = parseMadridCsv(fixtureText);

const HEADER =
  'gis_x;gis_y;cod_distrito;distrito;cod_barrio;num_barrio;barrio;calle;numero_finca;color;bateria_linea;numero_plazas';
// A real row (Recoletos, Alcalá 79) used as a base for synthetic edge cases.
const ROW = [
  '441756.3200000000',
  '4474663.8800000000',
  '4',
  'Salamanca',
  '41',
  '1',
  'Recoletos',
  'ALCALA, CALLE, DE',
  '79',
  '043000255 Azul',
  'Línea',
  '5',
];
const COL = { x: 0, y: 1, color: 9, spaces: 11 };
function csvWith(edit: (row: string[]) => void): string {
  const row = [...ROW];
  edit(row);
  return `${HEADER}\r\n${row.join(';')}\r\n`;
}

describe('decodeMadridCsv', () => {
  it('decodes the Latin-1 source bytes without mangling accents', () => {
    expect(fixtureText).toContain('Niño Jesús');
    expect(fixtureText).toContain('ISIDORO ÁLVAREZ ÁLVAREZ');
    expect(fixtureText).not.toContain('�');
  });

  it('also accepts UTF-8 input (with or without BOM) and yields the same text', () => {
    const utf8 = new TextEncoder().encode(fixtureText);
    expect(decodeMadridCsv(utf8)).toBe(fixtureText);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeMadridCsv(withBom)).toBe(fixtureText);
  });
});

describe('parseMadridCsv', () => {
  it('collapses the duplicated source row (29 rows -> 28 stretches)', () => {
    expect(stretches).toHaveLength(28);
    const sanMarcelo = stretches.filter((s) => s.street.includes('SAN MARCELO'));
    expect(sanMarcelo).toHaveLength(1);
  });

  it('maps colour codes to zone kinds (blue visitor, green resident, rest other)', () => {
    const count = (k: string) => stretches.filter((s) => s.kind === k).length;
    expect(count('visitor')).toBe(11);
    expect(count('resident')).toBe(10);
    expect(count('other')).toBe(7);

    const kindOf = (street: string) => stretches.find((s) => s.street.includes(street))?.kind;
    expect(kindOf('ALCALA')).toBe('visitor'); // 043000255 Azul
    expect(kindOf('PEÑA DE FRANCIA')).toBe('resident'); // 077214010 Verde
    expect(kindOf('CHOPERA')).toBe('other'); // 081209246 Alta Rotación
    expect(kindOf('PROFESOR MARTIN ALMAGRO BASCH')).toBe('other'); // 255140000 Naranja
    expect(kindOf('PEDRO RICO')).toBe('other'); // 255000000 Rojo
  });

  it('fills the common Stretch fields', () => {
    const s = stretches.find((x) => x.street.includes('ALCALA') && x.spaces === 5);
    expect(s).toMatchObject({
      city: 'madrid',
      neighbourhood: 'Recoletos',
      street: 'CALLE DE ALCALA',
      kind: 'visitor',
      spaces: 5,
    });
  });

  it('converts ETRS89 / UTM 30N to WGS84 (Neptune fountain within 50 m)', () => {
    const neptune = { lat: 40.415394, lng: -3.694064 };
    const plaza = stretches.filter((s) => s.street.includes('CANOVAS DEL CASTILLO'));
    expect(plaza).toHaveLength(2);
    const nearest = Math.min(...plaza.map((s) => haversineM(neptune, s)));
    expect(nearest).toBeLessThan(50);
    for (const s of stretches) {
      expect(s.lat).toBeGreaterThan(40.3);
      expect(s.lat).toBeLessThan(40.6);
      expect(s.lng).toBeGreaterThan(-3.9);
      expect(s.lng).toBeLessThan(-3.5);
    }
  });

  it('preserves accented and special characters in names', () => {
    const streets = stretches.map((s) => s.street);
    const hoods = stretches.map((s) => s.neighbourhood);
    expect(streets).toContain('CALLE DE LA PEÑA DE FRANCIA');
    expect(streets).toContain('CALLE DE ISIDORO ÁLVAREZ ÁLVAREZ');
    expect(streets).toContain('PASEO DE JUAN ANTONIO VALLEJO-NÁJERA BOTAS');
    expect(streets).toContain("CALLE DE O'DONNELL");
    expect(hoods).toEqual(expect.arrayContaining(['Niño Jesús', 'Argüelles', 'Ríos Rosas']));
  });

  it('gives every stretch a unique, deterministic id', () => {
    const ids = stretches.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^madrid-[0-9a-f]{16}$/);
    // Same input -> same ids; ids do not depend on row order.
    const reversed = [HEADER, ...fixtureText.trim().split(/\r\n/).slice(1).reverse()].join('\r\n');
    expect(new Set(parseMadridCsv(reversed).map((s) => s.id))).toEqual(new Set(ids));
    expect(parseMadridCsv(fixtureText)).toEqual(stretches);
  });

  it('treats 0 or missing spaces as 0, never NaN', () => {
    for (const value of ['0', '', '  ']) {
      const [s] = parseMadridCsv(csvWith((r) => (r[COL.spaces] = value)));
      expect(s.spaces).toBe(0);
    }
  });

  it('throws with the code in the message on an unknown colour code', () => {
    expect(() => parseMadridCsv(csvWith((r) => (r[COL.color] = '123456789 Morado')))).toThrow(
      /123456789/,
    );
  });

  it('accepts decimal commas in coordinates', () => {
    const [dot] = parseMadridCsv(csvWith(() => {}));
    const [comma] = parseMadridCsv(
      csvWith((r) => {
        r[COL.x] = r[COL.x].replace('.', ',');
        r[COL.y] = r[COL.y].replace('.', ',');
      }),
    );
    expect(comma).toEqual(dot);
  });

  it('throws on missing or non-numeric coordinates instead of emitting NaN', () => {
    expect(() => parseMadridCsv(csvWith((r) => (r[COL.x] = '')))).toThrow(/gis_x/);
    expect(() => parseMadridCsv(csvWith((r) => (r[COL.y] = 'n/a')))).toThrow(/gis_y/);
  });

  it('ignores blank lines, including trailing ones and LF-only endings', () => {
    const text = `${HEADER}\n\n${ROW.join(';')}\n;;;;;;;;;;;\n\n`;
    expect(parseMadridCsv(text)).toHaveLength(1);
  });

  it('throws when a required column is missing', () => {
    const text = `${HEADER.replace('color', 'colour')}\r\n${ROW.join(';')}\r\n`;
    expect(() => parseMadridCsv(text)).toThrow(/color/);
  });
});
