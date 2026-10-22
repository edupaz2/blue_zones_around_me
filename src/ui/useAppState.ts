import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { onAppReturn } from '../adapters/appVisibility';
import { watchLocation } from '../adapters/location';
import type { LocationStatus, Position } from '../adapters/location';
import { loadSession, loadSettings, saveSession, saveSettings } from '../adapters/storage';
import { madridConfig } from '../cities/madrid/config';
import { rankCandidates } from '../core/ranking';
import type { RankResult } from '../core/ranking';
import { sessionReducer } from '../core/session';
import type { SessionAction, SessionState, Settings } from '../core/types';
import type { ZoneData } from './useZoneData';

const TICK_MS = 60_000;
const WIDEN_STEP_M = 1000;

export function useAppState(data: ZoneData): {
  session: SessionState;
  settings: Settings;
  position: Position | null;
  locationStatus: LocationStatus;
  ranked: RankResult;
  radiiM: number[];
  dispatch: (a: SessionAction) => SessionState;
  setSettings: (s: Settings) => void;
  widen: () => void;
} {
  const [session, rawDispatch] = useReducer(sessionReducer, undefined, loadSession);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [position, setPosition] = useState<Position | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('unknown');
  const [radiiM, setRadiiM] = useState<number[]>(madridConfig.radiiM);

  // Mirror of the reducer state so every transition can be persisted synchronously,
  // before any follow-up side effect (e.g. opening the nav app, after which iOS may
  // suspend or reload the page before a post-render effect would have run).
  const sessionRef = useRef(session);
  const apply = useCallback((action: SessionAction): SessionState => {
    const next = sessionReducer(sessionRef.current, action);
    if (next !== sessionRef.current) {
      sessionRef.current = next;
      saveSession(next);
    }
    rawDispatch(action);
    return sessionRef.current;
  }, []);

  const dispatch = useCallback(
    (action: SessionAction): SessionState => {
      if (action.type === 'start') setRadiiM(madridConfig.radiiM);
      return apply(action);
    },
    [apply],
  );

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  const widen = useCallback(() => {
    setRadiiM((r) => [...r, r[r.length - 1]! + WIDEN_STEP_M]);
  }, []);

  useEffect(() => watchLocation(setPosition, setLocationStatus), []);

  useEffect(() => {
    const tick = () => apply({ type: 'tick', now: Date.now() });
    // Expire a stale restored session right away instead of up to a minute later.
    tick();
    const id = setInterval(tick, TICK_MS);
    const stop = onAppReturn(tick);
    return () => {
      clearInterval(id);
      stop();
    };
  }, [apply]);

  const ranked = useMemo<RankResult>(() => {
    if (session.origin === null || session.status === 'idle') return { ranked: [], radiusM: null };
    return rankCandidates(session.origin.point, data.candidates, session.tried, {
      radiiM,
      maxResults: madridConfig.maxResults,
    });
  }, [session.origin, session.status, session.tried, data.candidates, radiiM]);

  return {
    session,
    settings,
    position,
    locationStatus,
    ranked,
    radiiM,
    dispatch,
    setSettings,
    widen,
  };
}
