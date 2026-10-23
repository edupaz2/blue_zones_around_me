import { useCallback, useEffect, useState } from 'react';
import type { CandidateZone, Stretch } from '../core/types';

export interface ZoneData {
  stretches: Stretch[];
  candidates: CandidateZone[];
  sourceDate: string;
  generatedAt: string;
}

interface DataFile<T> {
  sourceDate: string;
  generatedAt: string;
  items: T[];
}

async function fetchFile<T>(url: string): Promise<DataFile<T>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as DataFile<T>;
}

async function loadZoneData(): Promise<ZoneData> {
  const base = import.meta.env.BASE_URL;
  const [stretches, candidates] = await Promise.all([
    fetchFile<Stretch>(`${base}data/madrid/stretches.json`),
    fetchFile<CandidateZone>(`${base}data/madrid/candidates.json`),
  ]);
  return {
    stretches: stretches.items,
    candidates: candidates.items,
    sourceDate: stretches.sourceDate,
    generatedAt: stretches.generatedAt,
  };
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ZoneData };

export function useZoneData(): {
  status: 'loading' | 'error' | 'ready';
  data?: ZoneData;
  retry: () => void;
} {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadZoneData().then(
      (data) => {
        if (!cancelled) setLoad({ status: 'ready', data });
      },
      () => {
        if (!cancelled) setLoad({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return load.status === 'ready'
    ? { status: 'ready', data: load.data, retry }
    : { status: load.status, retry };
}
