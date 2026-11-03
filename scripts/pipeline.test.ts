// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barcelonaConfig } from '../src/cities/barcelona/config';
import { madridConfig } from '../src/cities/madrid/config';
import { decodeBarcelonaCsv, loadBarris, parseBarcelonaCsv } from './cities/barcelona/parse';
import { buildDataFiles, diffByKind } from './pipeline';

const bytes = readFileSync(new URL('./cities/madrid/fixtures/ser-sample.csv', import.meta.url));

describe('buildDataFiles', () => {
  it('parses, validates and groups the fixture end to end', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const out = buildDataFiles({
      csvBytes: bytes,
      sourceDate: '2026-09-30',
      previousCount: null,
      now,
      city: madridConfig,
    });
    expect(out.stretches.items.length).toBeGreaterThan(0);
    expect(out.stretches.items.every((s) => s.kind !== 'other')).toBe(true);
    expect(out.stretches.sourceDate).toBe('2026-09-30');
    expect(out.stretches.generatedAt).toBe(now.toISOString());
    expect(out.candidates.items.length).toBeGreaterThan(0);
    const ids = out.stretches.items.map((s) => s.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('throws when the row count collapses versus the previous data', () => {
    expect(() =>
      buildDataFiles({
        csvBytes: bytes,
        sourceDate: 'x',
        previousCount: 100000,
        now: new Date(),
        city: madridConfig,
      }),
    ).toThrow(/Row count/);
  });
});

describe('buildDataFiles with the Barcelona parser', () => {
  const trams = readFileSync(
    new URL('./cities/barcelona/fixtures/trams-sample.csv', import.meta.url),
  );
  const barris = loadBarris(
    JSON.parse(
      readFileSync(new URL('../public/data/barcelona/barrios.geojson', import.meta.url), 'utf8'),
    ),
  );

  it('keeps blue and green stretches and groups the blue ones', () => {
    const out = buildDataFiles({
      csvBytes: trams,
      sourceDate: '2026-10-01',
      previousCount: null,
      now: new Date('2026-11-03T12:00:00Z'),
      city: barcelonaConfig,
      parse: (b) => parseBarcelonaCsv(decodeBarcelonaCsv(b), barris),
    });
    expect(out.stretches.items.map((s) => s.kind).sort()).toEqual([
      'resident',
      'resident',
      'resident',
      'visitor',
      'visitor',
      'visitor',
    ]);
    // Each blue stretch sits in a different barri, so each is its own candidate zone.
    expect(out.candidates.items.length).toBe(3);
    expect(out.candidates.items.every((z) => z.city === 'barcelona')).toBe(true);
  });
});

describe('diffByKind', () => {
  it('counts added and removed ids per kind', () => {
    const mk = (id: string, kind: 'visitor' | 'resident') => ({
      id,
      city: 'madrid',
      neighbourhood: 'n',
      street: 's',
      kind,
      spaces: 1,
      lat: 40.4,
      lng: -3.7,
    });
    const d = diffByKind(
      [mk('a', 'visitor'), mk('b', 'resident')],
      [mk('a', 'visitor'), mk('c', 'visitor')],
    );
    expect(d).toEqual({ visitor: { added: 1, removed: 0 }, resident: { added: 0, removed: 1 } });
  });
});
