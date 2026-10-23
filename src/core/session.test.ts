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

  it('choosing -> cancel -> fresh idle', () => {
    const s = reduce(choosing({ tried: ['a', 'b'], zoneId: 'z9' }), { type: 'cancel', now: 2000 });
    expect(s).toEqual({
      status: 'idle',
      origin: null,
      zoneId: null,
      tried: [],
      lastActivityAt: 2000,
    });
  });

  it('cancel is ignored (same reference) from idle and driving', () => {
    const idle = { ...initialSession, lastActivityAt: 1000 };
    expect(reduce(idle, { type: 'cancel', now: 2000 })).toBe(idle);
    const d = driving();
    expect(reduce(d, { type: 'cancel', now: 2000 })).toBe(d);
  });

  it('dismiss abandons a driving session and is a no-op otherwise', () => {
    const s = reduce(driving({ tried: ['a'] }), { type: 'dismiss', now: 2000 });
    expect(s).toEqual({ ...initialSession, lastActivityAt: 2000 });
    const c = choosing();
    expect(reduce(c, { type: 'dismiss', now: 2000 })).toBe(c);
  });

  it('cancel after the 90-minute expiry still yields idle', () => {
    const s = reduce(choosing(), { type: 'cancel', now: 1000 + SESSION_TIMEOUT_MS + 1 });
    expect(s.status).toBe('idle');
    expect(s.origin).toBeNull();
    expect(s.tried).toEqual([]);
  });
});

describe('sessionReducer relabel', () => {
  const relabel = (over: Partial<{ point: Origin['point']; label: string; now: number }> = {}) =>
    ({ type: 'relabel', point: o1.point, label: 'Calle Mayor 1', now: 2000, ...over }) as const;

  it('relabels a matching choosing destination origin without touching activity', () => {
    const s = reduce(choosing(), relabel());
    expect(s).toEqual(choosing({ origin: { ...o1, label: 'Calle Mayor 1' } }));
    expect(s.lastActivityAt).toBe(1000);
  });

  it('is ignored (same reference) for a different point', () => {
    const st = choosing();
    expect(reduce(st, relabel({ point: { lat: 1, lng: 2.0001 } }))).toBe(st);
    expect(reduce(st, relabel({ point: { lat: 1.0001, lng: 2 } }))).toBe(st);
  });

  it('is ignored for around mode', () => {
    const st = choosing({ origin: o2 });
    expect(reduce(st, relabel({ point: o2.point }))).toBe(st);
  });

  it('is ignored when idle, driving or without an origin', () => {
    const idle = { ...initialSession, lastActivityAt: 1000 };
    expect(reduce(idle, relabel())).toBe(idle);
    const d = driving();
    expect(reduce(d, relabel())).toBe(d);
  });

  it('is ignored for an identical label', () => {
    const st = choosing();
    expect(reduce(st, relabel({ label: 'A' }))).toBe(st);
  });

  it('is ignored after cancel', () => {
    const cancelled = reduce(choosing(), { type: 'cancel', now: 1500 });
    expect(reduce(cancelled, relabel({ now: 1600 }))).toBe(cancelled);
  });

  it('after expiry resets to idle first and is then ignored', () => {
    const s = reduce(choosing(), relabel({ now: 1000 + SESSION_TIMEOUT_MS + 1 }));
    expect(s).toBe(initialSession);
  });
});
