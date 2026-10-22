import { initialSession } from '../core/session';
import type { LatLng, Origin, SessionState, Settings } from '../core/types';

const SESSION_KEY = 'bza:v1:session';
const SETTINGS_KEY = 'bza:v1:settings';
const VERSION = 1;

const defaultSession = (): SessionState => ({
  ...initialSession,
  tried: [...initialSession.tried],
});
const defaultSettings = (): Settings => ({ showVisitor: true, showResident: true, navApp: null });

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isLatLng(v: unknown): v is LatLng {
  return isRec(v) && isNum(v.lat) && isNum(v.lng);
}

function isOrigin(v: unknown): v is Origin {
  return (
    isRec(v) &&
    (v.mode === 'destination' || v.mode === 'around') &&
    isLatLng(v.point) &&
    (v.label === undefined || typeof v.label === 'string')
  );
}

function isSession(v: unknown): v is SessionState {
  return (
    isRec(v) &&
    (v.status === 'idle' || v.status === 'choosing' || v.status === 'driving') &&
    (v.origin === null || isOrigin(v.origin)) &&
    (v.zoneId === null || typeof v.zoneId === 'string') &&
    Array.isArray(v.tried) &&
    v.tried.every((t) => typeof t === 'string') &&
    isNum(v.lastActivityAt) &&
    (v.status === 'idle' || v.origin !== null) &&
    (v.status !== 'driving' || typeof v.zoneId === 'string')
  );
}

function isSettings(v: unknown): v is Settings {
  return (
    isRec(v) &&
    typeof v.showVisitor === 'boolean' &&
    typeof v.showResident === 'boolean' &&
    (v.navApp === 'google' || v.navApp === 'waze' || v.navApp === null)
  );
}

function load<T>(key: string, guard: (v: unknown) => v is T, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback();
    const parsed: unknown = JSON.parse(raw);
    if (isRec(parsed) && parsed.v === VERSION && guard(parsed.data)) return parsed.data;
  } catch {
    // unavailable or corrupt: fall through to defaults
  }
  return fallback();
}

function save(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: VERSION, data }));
  } catch {
    // private mode or quota: ignore
  }
}

export const loadSession = (): SessionState => load(SESSION_KEY, isSession, defaultSession);
export const saveSession = (s: SessionState): void => save(SESSION_KEY, s);
export const loadSettings = (): Settings => load(SETTINGS_KEY, isSettings, defaultSettings);
export const saveSettings = (s: Settings): void => save(SETTINGS_KEY, s);
