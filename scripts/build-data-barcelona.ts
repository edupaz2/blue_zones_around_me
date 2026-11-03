import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { barcelonaConfig } from '../src/cities/barcelona/config';
import type { Stretch } from '../src/core/types';
import { decodeBarcelonaCsv, loadBarris, parseBarcelonaCsv } from './cities/barcelona/parse';
import { buildDataFiles, diffByKind, type DataFile } from './pipeline';

const CKAN_URL =
  'https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=trams-aparcament-superficie';
const OUT_DIR = new URL('../public/data/barcelona/', import.meta.url);

interface CkanResource {
  name: string;
  format: string;
  url: string;
  created: string | null;
}

/**
 * The plain CSV resource (TRAMS.csv) is the current file, but its CKAN
 * last_modified still says 2021 although its bytes equal the newest quarterly
 * ZIP. The source date is therefore the creation date of the newest quarterly
 * ZIP (YYYY_nT_TRAMS.csv.zip), which is when the council published the quarter.
 */
export function pickResource(resources: CkanResource[]): { url: string; sourceDate: string } {
  const csv = resources.find(
    (r) => r.format.toUpperCase() === 'CSV' && /TRAMS\.csv$/i.test(r.name),
  );
  if (!csv) throw new Error('No TRAMS.csv resource found in CKAN package');
  const dates = resources
    .filter((r) => /^\d{4}_\dT_TRAMS\.csv\.zip$/i.test(r.name) && r.created)
    .map((r) => (r.created ?? '').slice(0, 10))
    .sort();
  if (dates.length === 0) throw new Error('No quarterly TRAMS ZIP found to date the CSV');
  return { url: csv.url, sourceDate: dates[dates.length - 1] };
}

async function resolveSource(
  localPath: string | undefined,
): Promise<{ bytes: Uint8Array; sourceDate: string }> {
  if (localPath) {
    const name = /(\d{4}-\d{2}-\d{2})/.exec(localPath);
    return {
      bytes: new Uint8Array(readFileSync(localPath)),
      sourceDate: name ? name[1] : new Date().toISOString().slice(0, 10),
    };
  }
  const res = await fetch(CKAN_URL);
  if (!res.ok) throw new Error(`CKAN request failed: ${res.status}`);
  const pkg = (await res.json()) as { result: { resources: CkanResource[] } };
  const { url, sourceDate } = pickResource(pkg.result.resources);
  console.log(`Downloading ${url}`);
  const file = await fetch(url);
  if (!file.ok) throw new Error(`GET ${url} failed: ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), sourceDate };
}

function readPrevious(): Stretch[] | null {
  const file = new URL('stretches.json', OUT_DIR);
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, 'utf8')) as DataFile<Stretch>).items;
}

async function main(): Promise<void> {
  const localPath = process.argv[2] ?? process.env.TRAMS_CSV_PATH;
  const { bytes, sourceDate } = await resolveSource(localPath);
  const barrisFile = new URL('barrios.geojson', OUT_DIR);
  if (!existsSync(barrisFile)) {
    throw new Error('Missing barrios.geojson: run "python3 scripts/build-barris.py" first');
  }
  const barris = loadBarris(JSON.parse(readFileSync(barrisFile, 'utf8')));
  const previous = readPrevious();
  const out = buildDataFiles({
    csvBytes: bytes,
    sourceDate,
    previousCount: previous ? previous.length : null,
    now: new Date(),
    city: barcelonaConfig,
    parse: (b) => parseBarcelonaCsv(decodeBarcelonaCsv(b), barris),
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(new URL('stretches.json', OUT_DIR), JSON.stringify(out.stretches));
  writeFileSync(new URL('candidates.json', OUT_DIR), JSON.stringify(out.candidates));

  const diff = diffByKind(previous ?? [], out.stretches.items);
  console.log(`sourceDate ${sourceDate}`);
  console.log(
    `stretches: ${out.stretches.items.length}, candidate zones: ${out.candidates.items.length}`,
  );
  for (const kind of ['visitor', 'resident'] as const) {
    console.log(`${kind}: +${diff[kind].added} added, -${diff[kind].removed} removed`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
