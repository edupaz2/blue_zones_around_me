/**
 * Madrid SER parser: "Servicio de Estacionamiento Regulado (SER). Calles y
 * número de plazas" (datos.madrid.es dataset 218228-0-ser-calles) -> Stretch[].
 *
 * Findings from the 2026 file (calles-ser-2026-09-30.csv, 34,503 rows), checked
 * against the field reference EstructuraCallesSER2025.pdf (Oct 2025):
 *
 * - Encoding: ISO-8859-1 / windows-1252, NOT UTF-8 (the PDF says "Texto plano
 *   UTF-8", the bytes say otherwise: "Línea" is 0x4C 0xED ...). No BOM.
 *   decodeMadridCsv() tries strict UTF-8 first and falls back to windows-1252,
 *   so either encoding works.
 * - Delimiter ';', CRLF line endings, no quoting. Street names contain commas
 *   ("ALCALA, CALLE, DE"), so ',' is never a field separator.
 * - Columns (header row, in order): gis_x; gis_y; cod_distrito; distrito;
 *   cod_barrio; num_barrio; barrio; calle; numero_finca; color; bateria_linea;
 *   numero_plazas. (The PDF spells it "batería_línea"; the file does not.)
 *   Columns are looked up by name, accent- and case-insensitively.
 * - Coordinates: ETRS89 / UTM zone 30N (EPSG:25830), metres, '.' decimal
 *   separator with 10 decimals (e.g. 441756.3200000000). Converted to WGS84
 *   with proj4. A ',' decimal separator is also accepted. Each point is the
 *   approximate midpoint of the SER-regulated stretch.
 * - color: "<RGB as 9 decimal digits> <name>". Values and meaning (PDF):
 *     043000255 Azul          -> visitor  (Zona azul, "uso rotacional")
 *     077214010 Verde         -> resident (Zona verde, "uso residencial")
 *     081209246 Alta Rotación -> other    (high turnover)
 *     255140000 Naranja       -> other    (Ámbito Diferenciado Disuasorio)
 *     255000000 Rojo          -> other    (Ámbito Diferenciado Hospitalario)
 *   Matching is on the numeric code; any other code throws.
 *   2026 counts: Verde 30,190; Azul 4,150; Alta Rotación 73; Naranja 57; Rojo 33.
 * - numero_plazas: integer, 1..n in the 2026 file (no 0 or blank values seen);
 *   blank is treated as 0 regardless.
 * - numero_finca: house number or "S/N" (PDF also mentions "Sin asignar").
 * - Street names are upper case and mostly unaccented ("ALCALA"), but some
 *   carry accents/Ñ ("PEÑA DE FRANCIA", "ISIDORO ÁLVAREZ ÁLVAREZ"). Barrio and
 *   distrito names are mixed case with accents ("Niño Jesús", "Argüelles").
 * - Duplicates: exactly one fully identical duplicate row in the 2026 file
 *   (SAN MARCELO 3, Ventas). No blank rows.
 * - Bounds of the 2026 data in WGS84: lat 40.3781..40.4895,
 *   lng -3.7423..-3.6415.
 */
import { createHash } from 'node:crypto';
import proj4 from 'proj4';
import type { Stretch, ZoneKind } from '../../../src/core/types';

const CITY = 'madrid';

const UTM30N_ETRS89 = '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const toWgs84 = proj4(UTM30N_ETRS89, 'WGS84');

const KIND_BY_COLOUR_CODE: Record<string, ZoneKind> = {
  '043000255': 'visitor', // Azul
  '077214010': 'resident', // Verde
  '081209246': 'other', // Alta Rotación
  '255140000': 'other', // Naranja
  '255000000': 'other', // Rojo
};

const REQUIRED_COLUMNS = [
  'gis_x',
  'gis_y',
  'barrio',
  'calle',
  'numero_finca',
  'color',
  'bateria_linea',
  'numero_plazas',
] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

/** Decode the raw file: strict UTF-8 if valid, otherwise windows-1252 (the real file). */
export function decodeMadridCsv(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return stripBom(text);
}

/** Parse decoded CSV text into stretches. Throws on unknown colour codes or bad coordinates. */
export function parseMadridCsv(csvText: string): Stretch[] {
  const lines = stripBom(csvText).split(/\r\n|\n|\r/);
  const headerIndex = lines.findIndex((l) => !isBlank(l));
  if (headerIndex === -1) throw new Error('Madrid SER CSV: file is empty');
  const index = columnIndex(lines[headerIndex].split(';'));

  const byId = new Map<string, { stretch: Stretch; raw: string }>();
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) continue;
    const lineNo = i + 1;
    const fields = line.split(';');
    const get = (c: Column) => (fields[index[c]] ?? '').trim();

    const x = parseCoordinate(get('gis_x'), 'gis_x', lineNo);
    const y = parseCoordinate(get('gis_y'), 'gis_y', lineNo);
    const [lng, lat] = toWgs84.forward([x, y]);
    const colour = get('color');
    const street = get('calle');
    const finca = get('numero_finca');
    const layout = get('bateria_linea');

    const stretch: Stretch = {
      // Coordinates go into the id as parsed numbers (cm precision), so a change
      // of number format in a future file does not change ids.
      id: stretchId([x.toFixed(2), y.toFixed(2), street, finca, colour, layout]),
      city: CITY,
      neighbourhood: get('barrio'),
      street: formatStreet(street),
      kind: kindFor(colour, lineNo),
      spaces: parseSpaces(get('numero_plazas'), lineNo),
      lat: round6(lat),
      lng: round6(lng),
    };

    const raw = fields.map((f) => f.trim()).join(';');
    const existing = byId.get(stretch.id);
    if (existing) {
      if (existing.raw === raw) continue; // exact duplicate row
      throw new Error(
        `Madrid SER CSV line ${lineNo}: conflicting rows for the same stretch (${street} ${finca}, ${colour})`,
      );
    }
    byId.set(stretch.id, { stretch, raw });
  }
  return [...byId.values()].map((v) => v.stretch);
}

function columnIndex(header: string[]): Record<Column, number> {
  const names = header.map(normaliseColumnName);
  const index = {} as Record<Column, number>;
  for (const c of REQUIRED_COLUMNS) {
    const i = names.indexOf(c);
    if (i === -1) throw new Error(`Madrid SER CSV: missing column "${c}"`);
    index[c] = i;
  }
  return index;
}

function normaliseColumnName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function kindFor(colour: string, lineNo: number): ZoneKind {
  const code = colour.split(/\s+/)[0];
  const kind = Object.hasOwn(KIND_BY_COLOUR_CODE, code) ? KIND_BY_COLOUR_CODE[code] : undefined;
  if (!kind) {
    throw new Error(`Madrid SER CSV line ${lineNo}: unknown colour code "${colour}"`);
  }
  return kind;
}

function parseNumber(value: string): number {
  return value === '' ? NaN : Number(value.replace(',', '.'));
}

function parseCoordinate(value: string, column: string, lineNo: number): number {
  const n = parseNumber(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Madrid SER CSV line ${lineNo}: invalid ${column} "${value}"`);
  }
  return n;
}

function parseSpaces(value: string, lineNo: number): number {
  if (value === '') return 0;
  const n = parseNumber(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Madrid SER CSV line ${lineNo}: invalid numero_plazas "${value}"`);
  }
  return Math.round(n);
}

/** "PEÑA DE FRANCIA, CALLE, DE LA" -> "CALLE DE LA PEÑA DE FRANCIA". */
function formatStreet(calle: string): string {
  const parts = calle.split(',').map((p) => p.trim());
  const [name, type, particle] = parts;
  if (parts.length !== 3 || !name || !type) return calle;
  return [type, particle, name].filter(Boolean).join(' ');
}

/** Deterministic id from the source fields that identify a stretch (not its space count). */
function stretchId(key: string[]): string {
  const hash = createHash('sha256').update(key.join('\u001f')).digest('hex');
  return `${CITY}-${hash.slice(0, 16)}`;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function isBlank(line: string): boolean {
  return line.replace(/[;\s]/g, '') === '';
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
