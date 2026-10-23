import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, shouldEnableAnalytics, track } from './index';
import type { AnalyticsEvent } from './index';

const base = { prod: true, hostname: 'bluezones.example.org', search: '', doNotTrack: null };

describe('shouldEnableAnalytics', () => {
  it('is enabled in production on a real host', () => {
    expect(shouldEnableAnalytics(base)).toBe(true);
  });
  it('is disabled outside production', () => {
    expect(shouldEnableAnalytics({ ...base, prod: false })).toBe(false);
  });
  it.each([
    'localhost',
    '127.0.0.1',
    '[::1]',
    '192.168.1.5',
    '10.0.0.2',
    '172.20.1.1',
    '172.16.0.1',
    '172.31.255.1',
    'foo.local',
  ])('is disabled on %s', (hostname) => {
    expect(shouldEnableAnalytics({ ...base, hostname })).toBe(false);
  });
  it.each(['172.15.0.1', '172.32.0.1', '11.0.0.1', '193.168.1.1', 'edupaz2.github.io'])(
    'is enabled on public host %s',
    (hostname) => {
      expect(shouldEnableAnalytics({ ...base, hostname })).toBe(true);
    },
  );
  it('is disabled with the e2e flag', () => {
    expect(shouldEnableAnalytics({ ...base, search: '?e2e' })).toBe(false);
    expect(shouldEnableAnalytics({ ...base, search: '?a=1&e2e' })).toBe(false);
    expect(shouldEnableAnalytics({ ...base, search: '?e2e=1' })).toBe(false);
  });
  it('is not disabled by an unrelated query', () => {
    expect(shouldEnableAnalytics({ ...base, search: '?lang=es' })).toBe(true);
  });
  it('is disabled with Do Not Track = 1', () => {
    expect(shouldEnableAnalytics({ ...base, doNotTrack: '1' })).toBe(false);
  });
  it.each(['unspecified', null, '0', undefined])('ignores Do Not Track = %s', (doNotTrack) => {
    expect(shouldEnableAnalytics({ ...base, doNotTrack })).toBe(true);
  });
});

describe('track', () => {
  afterEach(() => {
    delete window.goatcounter;
    vi.unstubAllGlobals();
  });

  it('counts a constant-named event', () => {
    const count = vi.fn();
    window.goatcounter = { count };
    track('around-me');
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ path: 'around-me', title: 'Around me', event: true });
  });

  it('does nothing and does not throw when the script has not loaded', () => {
    expect(() => track('widen')).not.toThrow();
  });

  it('does not throw when count is not a function or throws', () => {
    (window as unknown as { goatcounter: unknown }).goatcounter = {};
    expect(() => track('widen')).not.toThrow();
    window.goatcounter = {
      count: () => {
        throw new Error('boom');
      },
    };
    expect(() => track('widen')).not.toThrow();
  });

  it('does nothing when Do Not Track is set', () => {
    const count = vi.fn();
    window.goatcounter = { count };
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    track('widen');
    expect(count).not.toHaveBeenCalled();
  });

  it('only ever sends path, title and event', () => {
    const count = vi.fn();
    window.goatcounter = { count };
    const all: AnalyticsEvent[] = [
      'around-me',
      'search-address',
      'map-long-press',
      'go-google',
      'go-waze',
      'found-yes',
      'found-next',
      'widen',
      'close-results',
    ];
    all.forEach(track);
    expect(count).toHaveBeenCalledTimes(9);
    for (const [arg] of count.mock.calls) {
      expect(Object.keys(arg as object).sort()).toEqual(['event', 'path', 'title']);
    }
  });
});

describe('initAnalytics', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('injects exactly one script with the exact attributes when enabled', () => {
    initAnalytics(base);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    const s = scripts[0]!;
    expect(s.async).toBe(true);
    expect(s.getAttribute('data-goatcounter')).toBe('https://bluezones.goatcounter.com/count');
    expect(s.getAttribute('src')).toBe('https://gc.zgo.at/count.js');
  });

  it('injects nothing when disabled', () => {
    initAnalytics({ ...base, prod: false });
    initAnalytics({ ...base, doNotTrack: '1' });
    initAnalytics({ ...base, hostname: 'localhost' });
    initAnalytics({ ...base, search: '?e2e' });
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('is idempotent', () => {
    initAnalytics(base);
    initAnalytics(base);
    expect(document.head.querySelectorAll('script[data-goatcounter]')).toHaveLength(1);
  });

  it('defaults to disabled under test (not production)', () => {
    initAnalytics();
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });
});
