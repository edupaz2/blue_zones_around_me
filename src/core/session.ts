import type { SessionAction, SessionState } from './types';

export const SESSION_TIMEOUT_MS = 90 * 60 * 1000;

export const initialSession: SessionState = {
  status: 'idle',
  origin: null,
  zoneId: null,
  tried: [],
  lastActivityAt: 0,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const expired = action.now - state.lastActivityAt > SESSION_TIMEOUT_MS;
  const cur = expired ? initialSession : state;
  const at = action.now;

  switch (action.type) {
    case 'start':
      return {
        status: 'choosing',
        origin: action.origin,
        zoneId: null,
        tried: [],
        lastActivityAt: at,
      };
    case 'go':
      if (cur.status !== 'choosing') return cur;
      return {
        ...cur,
        status: 'driving',
        zoneId: action.zoneId,
        lastActivityAt: at,
      };
    case 'found':
      if (cur.status !== 'driving') return cur;
      return { ...initialSession, lastActivityAt: at };
    case 'next':
      if (cur.status !== 'driving') return cur;
      return {
        status: 'choosing',
        origin: action.origin ?? cur.origin,
        zoneId: null,
        tried: cur.zoneId ? [...cur.tried, cur.zoneId] : cur.tried,
        lastActivityAt: at,
      };
    case 'tick':
      return cur;
  }
}
