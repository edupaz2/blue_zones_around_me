// Privacy-friendly analytics (GoatCounter). Framework-free.
//
// Privacy contract: only the constant event names below can ever be sent.
// Nothing user-derived (coordinates, search text, zone or street names) is
// accepted by `track`, and there are no cookies or stored identifiers.

export const GOATCOUNTER_ENDPOINT = 'https://bluezones.goatcounter.com/count';
export const GOATCOUNTER_SCRIPT_URL = 'https://gc.zgo.at/count.js';

export type AnalyticsEvent =
  | 'around-me'
  | 'search-address'
  | 'map-long-press'
  | 'go-google'
  | 'go-waze'
  | 'found-yes'
  | 'found-next'
  | 'widen'
  | 'close-results';

const EVENT_TITLES: Record<AnalyticsEvent, string> = {
  'around-me': 'Around me',
  'search-address': 'Search address',
  'map-long-press': 'Map long-press',
  'go-google': 'Go with Google Maps',
  'go-waze': 'Go with Waze',
  'found-yes': 'Found a spot: yes',
  'found-next': 'Found a spot: no, next zone',
  widen: 'Widen search',
  'close-results': 'Close results',
};

interface GoatCounterApi {
  count?: (vars: { path: string; title: string; event: boolean }) => void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounterApi;
    doNotTrack?: string | null;
  }
}

export interface EnableInput {
  prod: boolean;
  hostname: string;
  search: string;
  doNotTrack: string | null | undefined;
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
  if (h.endsWith('.local')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function shouldEnableAnalytics(input: EnableInput): boolean {
  if (!input.prod) return false;
  if (isLocalHost(input.hostname)) return false;
  if (new URLSearchParams(input.search).has('e2e')) return false;
  if (input.doNotTrack === '1') return false;
  return true;
}

function readDoNotTrack(): string | null {
  try {
    return navigator.doNotTrack ?? window.doNotTrack ?? null;
  } catch {
    return null;
  }
}

export function initAnalytics(options?: EnableInput): void {
  try {
    const input: EnableInput = options ?? {
      prod: import.meta.env.PROD,
      hostname: location.hostname,
      search: location.search,
      doNotTrack: readDoNotTrack(),
    };
    if (!shouldEnableAnalytics(input)) return;
    if (document.head.querySelector('script[data-goatcounter]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.goatcounter = GOATCOUNTER_ENDPOINT;
    script.src = GOATCOUNTER_SCRIPT_URL;
    document.head.appendChild(script);
  } catch {
    // Analytics must never break the app.
  }
}

export function track(event: AnalyticsEvent): void {
  try {
    if (readDoNotTrack() === '1') return;
    const count = window.goatcounter?.count;
    if (typeof count !== 'function') return;
    count.call(window.goatcounter, { path: event, title: EVENT_TITLES[event], event: true });
  } catch {
    // Blocked, offline or not loaded: ignore.
  }
}
