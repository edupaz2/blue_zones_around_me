/**
 * Barcelona parser: "Informació dels trams d'aparcament en superfície"
 * (opendata-ajuntament.barcelona.cat dataset trams-aparcament-superficie,
 * CC BY 4.0) -> Stretch[].
 *
 * Findings from the 2026-3T file (TRAMS.csv, 17,275 rows, byte-identical to
 * 2026_3T_TRAMS.csv inside the quarterly ZIP):
 *
 * - Encoding UTF-8 with a BOM, delimiter ',', every text field quoted
 *   ("ROGER DE FLOR, 79, C" contains commas), so a real CSV reader is needed.
 * - Columns: ID_TRAM, UTM_IX, UTM_FX, UTM_IY, UTM_FY, LATITUD_I, LONGITUD_I,
 *   LATITUD_F, LONGITUD_F, ID_TARIFA, ID_HORARIO, ID_TARIFA1, ID_HORARIO1,
 *   TIPUS_TRAM, ADREÇA, COLOR_RGB, PLACES. Looked up by name, accent- and
 *   case-insensitively. Coordinates are WGS84 decimals (the UTM columns are
 *   ETRS89 / UTM 31N and unused).
 * - A tram is NOT one row. Its geometry is split into straight pieces, one row
 *   per piece, all sharing ID_TRAM, TIPUS_TRAM, ADREÇA, tariff and PLACES.
 *   17,275 rows are 10,596 trams, and PLACES is the space count of the whole
 *   tram repeated on every piece (never differs within a tram; ~4 m per space).
 *   Summing rows would count blue spaces 2.3x too high (13,556 vs 5,850), so
 *   spaces are taken once per ID_TRAM.
 * - TIPUS_TRAM (trams / places in the 2026-3T file):
 *     AZL Àrea blava, 2.25-2.50 EUR/h, max 2 h      -> visitor   (929 / 5,850)
 *     VM  Àrea verda mixta, 2.75-3.00 EUR/h, max 1-2 h for visitors, resident
 *         rate otherwise                             -> resident (6,266 / 57,828)
 *     VR  Àrea verda for residents, 0.20 EUR/day     -> resident (370 / 2,945)
 *     DUM urban goods loading bays                   -> other
 *     BUS coach bays                                 -> other
 *   Any other code throws.
 * - Exactly one tram has no tariff (ID_TARIFA 0): 8448, AZL, 1 space, "...EN EL
 *   MAR PARA MONITORIZACION", a test point in the sea off Barceloneta. Rows
 *   without a tariff are not regulated stretches and are skipped.
 * - ADREÇA is "NAME, NUMBER, TYPE" (TYPE = C, AV, PG, RBLA, ...); 72 rows carry
 *   a fourth part ("VILAMARI, Fte, 90, C"), 13 names start with a code like
 *   "3444.- GRAN VISTA". The house number is dropped: a tram spans several.
 * - The file has no neighbourhood, so each stretch gets the barri (of 73)
 *   whose polygon contains it (public/data/barcelona/barrios.geojson).
 * - Bounds of the data: lat 41.3496..41.4523, lng 2.1035..2.2208.
 */
import type { Stretch, ZoneKind } from '../../../src/core/types';

const CITY = 'barcelona';

const KIND_BY_TYPE: Record<string, ZoneKind> = {
  AZL: 'visitor',
  VM: 'resident',
  VR: 'resident',
  DUM: 'other',
  BUS: 'other',
};

const STREET_TYPES: Record<string, string> = {
  C: 'CARRER',
  AV: 'AVINGUDA',
  PG: 'PASSEIG',
  RBLA: 'RAMBLA',
  PL: 'PLAÇA',
  PTGE: 'PASSATGE',
  RDA: 'RONDA',
  TRAV: 'TRAVESSERA',
  VIA: 'VIA',
  GV: 'GRAN VIA',
  CTRA: 'CARRETERA',
  RIER: 'RIERA',
  BDA: 'BAIXADA',
  CAMI: 'CAMÍ',
  PLA: 'PLA',
  T: 'TRAVESSIA',
  PAS: 'PAS',
  JARD: 'JARDINS',
  JRDI: 'JARDÍ',
  PLTA: 'PLACETA',
  CSTA: 'COSTA',
};

const REQUIRED_COLUMNS = [
  'id_tram',
  'latitud_i',
  'longitud_i',
  'latitud_f',
  'longitud_f',
  'tipus_tram',
  'id_tarifa',
  'adreca',
  'places',
] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

/** A barri polygon set, as written by scripts/build-barris.py. */
export interface Barri {
  name: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** GeoJSON MultiPolygon coordinates: polygons of [outer ring, ...holes]. */
  polygons: number[][][][];
}

interface BarrisGeoJson {
  features: {
    properties: { name: string };
    geometry: { coordinates: number[][][][] };
  }[];
}

/** Farthest a stretch may sit from every barri polygon before the file is rejected (metres). */
const MAX_OUTSIDE_M = 150;
const M_PER_DEG_LAT = 111195;

export function decodeBarcelonaCsv(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function loadBarris(geojson: BarrisGeoJson): Barri[] {
  return geojson.features.map((f) => {
    const polygons = f.geometry.coordinates;
    const pts = polygons.flatMap((poly) => poly[0]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      name: f.properties.name,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      polygons,
    };
  });
}

/** Parse decoded CSV text into stretches (one per ID_TRAM). Throws on unknown types or bad rows. */
export function parseBarcelonaCsv(csvText: string, barris: Barri[]): Stretch[] {
  const rows = readCsv(csvText);
  if (rows.length === 0) throw new Error('Barcelona trams CSV: file is empty');
  const index = columnIndex(rows[0]);

  interface Tram {
    type: string;
    address: string;
    spaces: number;
    midpoints: { lat: number; lng: number }[];
  }
  const trams = new Map<string, Tram>();
  for (let i = 1; i < rows.length; i++) {
    const lineNo = i + 1;
    const fields = rows[i];
    const get = (c: Column) => (fields[index[c]] ?? '').trim();

    const id = get('id_tram');
    if (id === '') throw new Error(`Barcelona trams CSV line ${lineNo}: missing ID_TRAM`);
    const type = get('tipus_tram');
    if (!Object.hasOwn(KIND_BY_TYPE, type)) {
      throw new Error(`Barcelona trams CSV line ${lineNo}: unknown TIPUS_TRAM "${type}"`);
    }
    const tariff = get('id_tarifa');
    if (tariff === '' || Number(tariff) === 0) continue; // test record, not a regulated stretch
    const spaces = parseSpaces(get('places'), lineNo);
    const lat =
      (coord(get('latitud_i'), 'LATITUD_I', lineNo) +
        coord(get('latitud_f'), 'LATITUD_F', lineNo)) /
      2;
    const lng =
      (coord(get('longitud_i'), 'LONGITUD_I', lineNo) +
        coord(get('longitud_f'), 'LONGITUD_F', lineNo)) /
      2;

    const tram = trams.get(id);
    if (!tram) {
      trams.set(id, { type, address: get('adreca'), spaces, midpoints: [{ lat, lng }] });
    } else if (tram.type !== type || tram.spaces !== spaces) {
      throw new Error(
        `Barcelona trams CSV line ${lineNo}: pieces of tram ${id} disagree on type or places`,
      );
    } else {
      tram.midpoints.push({ lat, lng });
    }
  }

  const out: Stretch[] = [];
  for (const [id, tram] of trams) {
    const at = medoid(tram.midpoints);
    out.push({
      id: `${CITY}-${id}`,
      city: CITY,
      neighbourhood: barriAt(barris, at.lng, at.lat, id),
      street: formatStreet(tram.address),
      kind: KIND_BY_TYPE[tram.type],
      spaces: tram.spaces,
      lat: round6(at.lat),
      lng: round6(at.lng),
    });
  }
  return out;
}

/** RFC 4180 reader: quoted fields may contain commas, doubled quotes and newlines. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function columnIndex(header: string[]): Record<Column, number> {
  const names = header.map((n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const index = {} as Record<Column, number>;
  for (const c of REQUIRED_COLUMNS) {
    const i = names.indexOf(c);
    if (i === -1) throw new Error(`Barcelona trams CSV: missing column "${c}"`);
    index[c] = i;
  }
  return index;
}

function coord(value: string, column: string, lineNo: number): number {
  const n = value === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Barcelona trams CSV line ${lineNo}: invalid ${column} "${value}"`);
  }
  return n;
}

function parseSpaces(value: string, lineNo: number): number {
  if (value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Barcelona trams CSV line ${lineNo}: invalid PLACES "${value}"`);
  }
  return Math.round(n);
}

/** The piece midpoint closest to the mean, so the point is always on the tram's own street. */
function medoid(points: { lat: number; lng: number }[]): { lat: number; lng: number } {
  const mean = {
    lat: points.reduce((n, p) => n + p.lat, 0) / points.length,
    lng: points.reduce((n, p) => n + p.lng, 0) / points.length,
  };
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.lat - mean.lat) ** 2 + (p.lng - mean.lng) ** 2;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** "ROGER DE FLOR, 79, C" -> "CARRER ROGER DE FLOR" (house number dropped). */
function formatStreet(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  const name = (parts[0] ?? '').replace(/^\d+\.-\s*/, '');
  const type = parts.length > 1 ? parts[parts.length - 1] : '';
  if (name === '') return address;
  const long = Object.hasOwn(STREET_TYPES, type) ? STREET_TYPES[type] : type;
  return long ? `${long} ${name}` : name;
}

function barriAt(barris: Barri[], lng: number, lat: number, tramId: string): string {
  for (const b of barris) {
    const [w, s, e, n] = b.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    for (const poly of b.polygons) {
      if (inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole))) {
        return b.name;
      }
    }
  }
  // On a boundary or just outside the simplified polygons: take the nearest barri.
  const cos = Math.cos((lat * Math.PI) / 180);
  let best = '';
  let bestM = Infinity;
  for (const b of barris) {
    for (const poly of b.polygons) {
      for (const [x, y] of poly[0]) {
        const m = Math.hypot((x - lng) * cos, y - lat) * M_PER_DEG_LAT;
        if (m < bestM) {
          bestM = m;
          best = b.name;
        }
      }
    }
  }
  if (bestM > MAX_OUTSIDE_M) {
    throw new Error(`Barcelona tram ${tramId}: ${Math.round(bestM)} m from every barri polygon`);
  }
  return best;
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
