import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { madridConfig } from '../src/cities/madrid/config';
import type { Stretch } from '../src/core/types';
import { buildDataFiles, diffByKind, type DataFile } from './pipeline';

const CKAN_URL = 'https://datos.madrid.es/api/3/action/package_show?id=218228-0-ser-calles';
const OUT_DIR = new URL('../public/data/madrid/', import.meta.url);

interface CkanResource {
  name: string;
  format: string;
  url: string;
  last_modified: string | null;
}

/**
 * Resource selection rule: among CSV resources, prefer those whose file name
 * carries a date (calles-ser-YYYY-MM-DD.csv) and take the latest such date;
 * otherwise take the newest last_modified.
 * sourceDate rule: the date in the file name if present, else the
 * last_modified date (YYYY-MM-DD).
 */
export function pickResource(resources: CkanResource[]): { url: string; sourceDate: string } {
  const csvs = resources.filter((r) => r.format.toUpperCase() === 'CSV');
  const dated = csvs
    .map((r) => ({ r, m: /(\d{4}-\d{2}-\d{2})\.csv$/i.exec(r.url) }))
    .filter((x): x is { r: CkanResource; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => (a.m[1] < b.m[1] ? 1 : -1));
  if (dated.length > 0) return { url: dated[0].r.url, sourceDate: dated[0].m[1] };
  const byMod = csvs
    .filter((r) => r.last_modified)
    .sort((a, b) => ((a.last_modified ?? '') < (b.last_modified ?? '') ? 1 : -1));
  if (byMod.length === 0) throw new Error('No CSV resource found in CKAN package');
  return { url: byMod[0].url, sourceDate: (byMod[0].last_modified ?? '').slice(0, 10) };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
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
  return { bytes: await fetchBytes(url), sourceDate };
}

function readPrevious(): Stretch[] | null {
  const file = new URL('stretches.json', OUT_DIR);
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, 'utf8')) as DataFile<Stretch>).items;
}

async function main(): Promise<void> {
  const localPath = process.argv[2] ?? process.env.SER_CSV_PATH;
  const { bytes, sourceDate } = await resolveSource(localPath);
  const previous = readPrevious();
  const out = buildDataFiles({
    csvBytes: bytes,
    sourceDate,
    previousCount: previous ? previous.length : null,
    now: new Date(),
    city: madridConfig,
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
