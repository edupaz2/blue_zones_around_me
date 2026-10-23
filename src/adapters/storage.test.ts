import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialSession } from '../core/session';
import type { SessionState, Settings } from '../core/types';
import { loadSession, loadSettings, saveSession, saveSettings } from './storage';

const defaultSettings: Settings = { showVisitor: true, showResident: true, navApp: null };

const choosing: SessionState = {
  status: 'choosing',
  origin: { mode: 'destination', point: { lat: 40.4, lng: -3.7 }, label: 'Sol' },
  zoneId: null,
  tried: ['z1', 'z2'],
  lastActivityAt: 12345,
};

// Node 25 ships a (broken, file-less) global localStorage that shadows jsdom's,
// so tests install a small in-memory Storage with the same surface.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  clear(): void {
    this.m.clear();
  }
}

beforeEach(() => vi.stubGlobal('localStorage', new MemStorage()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function breakStorage(): void {
  vi.spyOn(MemStorage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(MemStorage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
}

describe('session storage', () => {
  it('returns initialSession on empty storage', () => {
    expect(loadSession()).toEqual(initialSession);
  });

  it('returns a fresh tried array for defaults', () => {
    expect(loadSession().tried).not.toBe(initialSession.tried);
  });

  it('round-trips a choosing session intact', () => {
    saveSession(choosing);
    expect(loadSession()).toEqual(choosing);
  });

  it('round-trips a driving session', () => {
    const s: SessionState = { ...choosing, status: 'driving', zoneId: 'z3' };
    saveSession(s);
    expect(loadSession()).toEqual(s);
  });

  it('falls back on corrupt JSON', () => {
    localStorage.setItem('bza:v1:session', '{not json');
    expect(loadSession()).toEqual(initialSession);
  });

  it('falls back on wrong version', () => {
    localStorage.setItem('bza:v1:session', JSON.stringify({ v: 2, data: choosing }));
    expect(loadSession()).toEqual(initialSession);
  });

  it('falls back on wrong shape', () => {
    localStorage.setItem(
      'bza:v1:session',
      JSON.stringify({ v: 1, data: { ...choosing, status: 'bogus' } }),
    );
    expect(loadSession()).toEqual(initialSession);
  });

  it('falls back on invalid origin / tried / lastActivityAt', () => {
    const bad = [
      { ...choosing, origin: { mode: 'around', point: { lat: 'x', lng: 1 } } },
      { ...choosing, tried: [1] },
      { ...choosing, lastActivityAt: 'now' },
    ];
    for (const data of bad) {
      localStorage.setItem('bza:v1:session', JSON.stringify({ v: 1, data }));
      expect(loadSession()).toEqual(initialSession);
    }
  });

  it('rejects inconsistent status/field combinations', () => {
    const bad = [
      { ...choosing, status: 'driving', zoneId: null },
      { ...choosing, status: 'driving', zoneId: 'z3', origin: null },
      { ...choosing, origin: null },
    ];
    for (const data of bad) {
      localStorage.setItem('bza:v1:session', JSON.stringify({ v: 1, data }));
      expect(loadSession()).toEqual(initialSession);
    }
  });

  it('accepts idle with leftover origin and tried', () => {
    const s: SessionState = { ...choosing, status: 'idle' };
    saveSession(s);
    expect(loadSession()).toEqual(s);
  });

  it('does not throw when storage throws', () => {
    breakStorage();
    expect(loadSession()).toEqual(initialSession);
    expect(() => saveSession(choosing)).not.toThrow();
  });
});

describe('settings storage', () => {
  it('returns defaults on empty storage', () => {
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it('round-trips', () => {
    const s: Settings = { showVisitor: false, showResident: true, navApp: 'waze' };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it('falls back on corrupt, wrong version, wrong shape', () => {
    localStorage.setItem('bza:v1:settings', 'nope');
    expect(loadSettings()).toEqual(defaultSettings);
    localStorage.setItem('bza:v1:settings', JSON.stringify({ v: 0, data: defaultSettings }));
    expect(loadSettings()).toEqual(defaultSettings);
    localStorage.setItem(
      'bza:v1:settings',
      JSON.stringify({ v: 1, data: { ...defaultSettings, navApp: 'apple' } }),
    );
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it('does not throw when storage throws', () => {
    breakStorage();
    expect(loadSettings()).toEqual(defaultSettings);
    expect(() => saveSettings(defaultSettings)).not.toThrow();
  });
});
