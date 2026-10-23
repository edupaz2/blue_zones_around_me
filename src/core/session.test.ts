import { describe, expect, it } from 'vitest';
import { SESSION_TIMEOUT_MS, initialSession, sessionReducer as reduce } from './session';
import type { Origin, SessionState } from './types';

const o1: Origin = { mode: 'destination', point: { lat: 1, lng: 2 }, label: 'A' };
const o2: Origin = { mode: 'around', point: { lat: 3, lng: 4 } };

const choosing = (over: Partial<SessionState> = {}): SessionState => ({
  status: 'choosing',
  origin: o1,
  zoneId: null,
  tried: [],
  lastActivityAt: 1000,
  ...over,
});
const driving = (over: Partial<SessionState> = {}): SessionState =>
  choosing({ status: 'driving', zoneId: 'z1', ...over });

describe('sessionReducer', () => {
  it('idle -> start -> choosing with empty tried', () => {
    const s = reduce(initialSession, { type: 'start', origin: o1, now: 5 });
    expect(s).toEqual({
      status: 'choosing',
      origin: o1,
      zoneId: null,
      tried: [],
      lastActivityAt: 5,
    });
  });

  it('choosing -> go -> driving', () => {
    const s = reduce(choosing(), { type: 'go', zoneId: 'z1', now: 2000 });
    expect(s.status).toBe('driving');
    expect(s.zoneId).toBe('z1');
    expect(s.lastActivityAt).toBe(2000);
  });

  it('driving -> found -> idle', () => {
    const s = reduce(driving(), { type: 'found', now: 2000 });
    expect(s.status).toBe('idle');
    expect(s.zoneId).toBeNull();
    expect(s.tried).toEqual([]);
  });

  it('driving -> next -> choosing with zone appended to tried', () => {
    const s = reduce(driving({ tried: ['a'] }), { type: 'next', now: 2000 });
    expect(s.status).toBe('choosing');
    expect(s.zoneId).toBeNull();
    expect(s.tried).toEqual(['a', 'z1']);
  });

  it('next with origin replaces it, without keeps it', () => {
    expect(reduce(driving(), { type: 'next', now: 2000, origin: o2 }).origin).toEqual(o2);
    expect(reduce(driving(), { type: 'next', now: 2000 }).origin).toEqual(o1);
  });

  it('start while choosing/driving clears tried', () => {
    for (const st of [choosing({ tried: ['a'] }), driving({ tried: ['a'] })]) {
      const s = reduce(st, { type: 'start', origin: o2, now: 2000 });
      expect(s.status).toBe('choosing');
      expect(s.tried).toEqual([]);
      expect(s.origin).toEqual(o2);
      expect(s.zoneId).toBeNull();
    }
  });

  it('go when idle is ignored', () => {
    const s = reduce(initialSession, { type: 'go', zoneId: 'z', now: 5 });
    expect(s.status).toBe('idle');
  });

  it('expires after strictly more than 90 minutes', () => {
    const st = driving({ tried: ['a'] });
    const now = st.lastActivityAt + SESSION_TIMEOUT_MS + 1;
    const s = reduce(st, { type: 'go', zoneId: 'z2', now });
    expect(s.status).toBe('idle');
    expect(s.tried).toEqual([]);
    expect(s.origin).toBeNull();
  });

  it('start after expiry still begins a new search', () => {
    const st = driving();
    const now = st.lastActivityAt + SESSION_TIMEOUT_MS + 1;
    const s = reduce(st, { type: 'start', origin: o2, now });
    expect(s.status).toBe('choosing');
    expect(s.origin).toEqual(o2);
    expect(s.tried).toEqual([]);
  });

  it('exactly 90 minutes does not expire', () => {
    const st = choosing();
    const now = st.lastActivityAt + SESSION_TIMEOUT_MS;
    const s = reduce(st, { type: 'go', zoneId: 'z1', now });
    expect(s.status).toBe('driving');
  });

  it('tick past expiry -> idle, before -> unchanged', () => {
    const st = driving();
    const late = st.lastActivityAt + SESSION_TIMEOUT_MS + 1;
    expect(reduce(st, { type: 'tick', now: late }).status).toBe('idle');
    expect(reduce(st, { type: 'tick', now: 2000 })).toEqual(st);
  });
});
