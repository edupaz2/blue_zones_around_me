import { describe, expect, it, vi } from 'vitest';
import { FALLBACK_STYLE, resolveStyle } from './mapStyle';

const asFetch = (f: unknown) => f as typeof fetch;

describe('resolveStyle', () => {
  it('returns the parsed style when the fetch succeeds', async () => {
    const style = { version: 8, sources: {}, layers: [] };
    const f = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(style) }));
    expect(await resolveStyle('u', asFetch(f))).toEqual({ style, fallback: false });
  });
  it('falls back on an HTTP error', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => ({}) }));
    expect(await resolveStyle('u', asFetch(f))).toEqual({ style: FALLBACK_STYLE, fallback: true });
  });
  it('falls back on a network error', async () => {
    const f = vi.fn(() => Promise.reject(new Error('offline')));
    expect((await resolveStyle('u', asFetch(f))).fallback).toBe(true);
  });
  it('falls back on invalid JSON', async () => {
    const f = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad')) }),
    );
    expect((await resolveStyle('u', asFetch(f))).fallback).toBe(true);
  });
  it('falls back on timeout', async () => {
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    expect((await resolveStyle('u', asFetch(f), 10)).fallback).toBe(true);
  });
});
