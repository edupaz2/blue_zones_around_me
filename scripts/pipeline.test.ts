// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { madridConfig } from '../src/cities/madrid/config';
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
