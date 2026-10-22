import { decodeMadridCsv, parseMadridCsv } from './cities/madrid/parse';
import { groupVisitorStretches } from './group';
import { validateStretches } from './validate';
import type { CandidateZone, CityConfig, Stretch } from '../src/core/types';

export interface DataFile<T> {
  sourceDate: string;
  generatedAt: string;
  items: T[];
}

export interface PipelineInput {
  csvBytes: Uint8Array;
  sourceDate: string;
  previousCount: number | null;
  now: Date;
  city: Pick<CityConfig, 'id' | 'bounds' | 'groupingRadiusM'>;
}

export interface PipelineOutput {
  stretches: DataFile<Stretch>;
  candidates: DataFile<CandidateZone>;
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Pure part of the pipeline: CSV bytes -> parse -> validate -> group. */
export function buildDataFiles(input: PipelineInput): PipelineOutput {
  const { csvBytes, sourceDate, previousCount, now, city } = input;
  const parsed = parseMadridCsv(decodeMadridCsv(csvBytes));
  const kept = parsed.filter((s) => s.kind === 'visitor' || s.kind === 'resident').sort(byId);
  validateStretches(kept, city.bounds, previousCount);
  const generatedAt = now.toISOString();
  return {
    stretches: { sourceDate, generatedAt, items: kept },
    candidates: {
      sourceDate,
      generatedAt,
      items: groupVisitorStretches(kept, city.id, city.groupingRadiusM),
    },
  };
}

export interface KindDiff {
  added: number;
  removed: number;
}

/** Per-kind count of stretch ids added/removed versus the previous data. */
export function diffByKind(
  previous: Stretch[],
  next: Stretch[],
): Record<'visitor' | 'resident', KindDiff> {
  const out = {
    visitor: { added: 0, removed: 0 },
    resident: { added: 0, removed: 0 },
  };
  const prevIds = new Set(previous.map((s) => s.id));
  const nextIds = new Set(next.map((s) => s.id));
  for (const s of next) {
    if (!prevIds.has(s.id) && (s.kind === 'visitor' || s.kind === 'resident')) {
      out[s.kind].added++;
    }
  }
  for (const s of previous) {
    if (!nextIds.has(s.id) && (s.kind === 'visitor' || s.kind === 'resident')) {
      out[s.kind].removed++;
    }
  }
  return out;
}
