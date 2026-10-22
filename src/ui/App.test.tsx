import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, loadSettings, saveSession, saveSettings } from '../adapters/storage';
import type { CandidateZone, SessionState, Stretch } from '../core/types';
import App from '../App';
import { useAppState } from './useAppState';
import type { ZoneData } from './useZoneData';

// MapLibre needs WebGL, which jsdom lacks.
const mapProps = vi.hoisted(() => ({
  onLongPress: null as null | ((p: { lat: number; lng: number }) => void),
  highlightedZoneId: undefined as string | null | undefined,
}));
const nav = vi.hoisted(() => ({ openNavigation: vi.fn() }));
vi.mock('./openNavigation', () => nav);
vi.mock('./MapView', () => ({
  default: (props: {
    onLongPress: (p: { lat: number; lng: number }) => void;
    highlightedZoneId: string | null;
  }) => {
    mapProps.onLongPress = props.onLongPress;
    mapProps.highlightedZoneId = props.highlightedZoneId;
    return <div data-testid="map" />;
  },
}));

vi.mock('../adapters/geocoder', () => ({
  searchPlaces: vi.fn(() =>
    Promise.resolve([{ label: 'Puerta del Sol', point: { lat: 40.4168, lng: -3.7038 } }]),
  ),
}));

const stretch: Stretch = {
  id: 's1',
  city: 'madrid',
  neighbourhood: 'Centro',
  street: 'CALLE X',
  kind: 'visitor',
  spaces: 10,
  lat: 40.4168,
  lng: -3.7038,
};
const zone = (id: string, lat: number): CandidateZone => ({
  id,
  city: 'madrid',
  neighbourhood: 'Centro',
  stretchIds: ['s1'],
  streets: ['CALLE X'],
  totalSpaces: 10,
  centroid: { lat, lng: -3.7038 },
  target: { lat, lng: -3.7038 },
});
const stretchesFile = { sourceDate: '2026-09-30', generatedAt: 'g', items: [stretch] };
const candidatesFile = {
  sourceDate: '2026-09-30',
  generatedAt: 'g',
  items: [zone('z1', 40.4168), zone('z2', 40.418)],
};

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

function mockFetchOk() {
  return vi.fn((url: string) =>
    ok(url.endsWith('stretches.json') ? stretchesFile : candidatesFile),
  );
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
});
afterEach(() => {
  cleanup();
  nav.openNavigation.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('App data loading', () => {
  it('shows loading and then the ready shell', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    expect(screen.getByText('Loading zones…')).toBeInTheDocument();
    expect(await screen.findByTestId('app-ready')).toBeInTheDocument();
  });

  it('shows an error with Retry that refetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(<App />);
    expect(await screen.findByText("Couldn't load zone data")).toBeInTheDocument();
    const good = mockFetchOk();
    vi.stubGlobal('fetch', good);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('app-ready')).toBeInTheDocument();
    expect(good).toHaveBeenCalledTimes(2);
  });

  it('treats a non-ok response as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })),
    );
    render(<App />);
    expect(await screen.findByText("Couldn't load zone data")).toBeInTheDocument();
  });
});

describe('App search flow', () => {
  it('selecting a search result starts a session and shows the panel', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByTestId('app-ready');
    expect(screen.queryByRole('region', { name: 'Blue zones' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sol' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Puerta del Sol' }));
    expect(await screen.findByRole('region', { name: 'Blue zones' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(localStorage.getItem('bza:v1:session')).toContain('destination');
  });
});

describe('App long-press', () => {
  it('out-of-bounds long-press shows an alert and starts nothing', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByTestId('app-ready');
    act(() => mapProps.onLongPress!({ lat: 41.4, lng: 2.17 }));
    expect(screen.getByText('That point is outside the Madrid SER area')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Blue zones' })).not.toBeInTheDocument();
    expect(localStorage.getItem('bza:v1:session') ?? '').not.toContain('destination');
  });

  it('in-bounds long-press starts a destination session', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByTestId('app-ready');
    act(() => mapProps.onLongPress!({ lat: 40.4168, lng: -3.7038 }));
    expect(await screen.findByRole('region', { name: 'Blue zones' })).toBeInTheDocument();
  });
});

const data: ZoneData = {
  stretches: [stretch],
  candidates: candidatesFile.items,
  sourceDate: '2026-09-30',
  generatedAt: 'g',
};

function Probe() {
  const s = useAppState(data);
  return (
    <div>
      <span data-testid="status">{s.session.status}</span>
      <span data-testid="ranked">{s.ranked.ranked.length}</span>
      <span data-testid="radii">{s.radiiM.join(',')}</span>
      <button
        onClick={() =>
          s.dispatch({
            type: 'start',
            origin: { mode: 'around', point: { lat: 40.4168, lng: -3.7038 } },
            now: Date.now(),
          })
        }
      >
        start
      </button>
      <button onClick={s.widen}>widen</button>
    </div>
  );
}

describe('useAppState', () => {
  it('restores a persisted choosing session with non-empty ranked', () => {
    saveSession({
      status: 'choosing',
      origin: { mode: 'around', point: { lat: 40.4168, lng: -3.7038 } },
      zoneId: null,
      tried: [],
      lastActivityAt: Date.now(),
    });
    render(<Probe />);
    expect(screen.getByTestId('status')).toHaveTextContent('choosing');
    expect(Number(screen.getByTestId('ranked').textContent)).toBeGreaterThan(0);
  });

  it('persists dispatched sessions and widens/resets radii', () => {
    render(<Probe />);
    expect(screen.getByTestId('ranked')).toHaveTextContent('0');
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByTestId('status')).toHaveTextContent('choosing');
    expect(localStorage.getItem('bza:v1:session')).toContain('choosing');
    fireEvent.click(screen.getByText('widen'));
    expect(screen.getByTestId('radii')).toHaveTextContent('800,1200,1600,2000,3000');
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByTestId('radii')).toHaveTextContent('800,1200,1600,2000');
  });

  it('expires an idle session via the 60 s tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    render(<Probe />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByTestId('status')).toHaveTextContent('choosing');
    act(() => {
      vi.setSystemTime(1_000_000 + 91 * 60 * 1000);
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });
});

const here = { lat: 40.4168, lng: -3.7038 };
const sessionOf = (over: Partial<SessionState>): SessionState => ({
  status: 'choosing',
  origin: { mode: 'around', point: here },
  zoneId: null,
  tried: [],
  lastActivityAt: Date.now(),
  ...over,
});
const storedSession = loadSession;

describe('useAppState mount tick', () => {
  it('expires a restored session older than 90 minutes immediately', () => {
    saveSession(sessionOf({ lastActivityAt: Date.now() - 91 * 60 * 1000 }));
    render(<Probe />);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });
});

describe('App go flow', () => {
  it('first Go shows the chooser, dispatches go before opening, and saves the choice', async () => {
    saveSession(sessionOf({}));
    vi.stubGlobal('fetch', mockFetchOk());
    let persistedAtOpen: string | null = null;
    nav.openNavigation.mockImplementation(() => {
      persistedAtOpen = localStorage.getItem('bza:v1:session');
    });
    render(<App />);
    await screen.findByRole('region', { name: 'Blue zones' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Go' })[0]!);
    expect(nav.openNavigation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Waze' }));
    expect(nav.openNavigation).toHaveBeenCalledTimes(1);
    expect(nav.openNavigation.mock.calls[0]![0]).toMatch(/^https:\/\/waze\.com\/ul\?ll=/);
    expect(persistedAtOpen).toContain('driving');
    expect(loadSettings().navApp).toBe('waze');
    expect(screen.getByText('Found a spot?')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Blue zones' })).not.toBeInTheDocument();
  });

  it('a saved app skips the chooser', async () => {
    saveSettings({ showVisitor: true, showResident: true, navApp: 'google' });
    saveSession(sessionOf({}));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByRole('region', { name: 'Blue zones' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Go' })[0]!);
    expect(screen.queryByText('Navigate with')).not.toBeInTheDocument();
    expect(nav.openNavigation.mock.calls[0]![0]).toContain(
      'https://www.google.com/maps/dir/?api=1&destination=',
    );
  });
});

describe('App reload survival and found-a-spot', () => {
  it('restored driving session shows the prompt, not the panel', async () => {
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1' }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    expect(await screen.findByText('Found a spot?')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Blue zones' })).not.toBeInTheDocument();
  });

  it('restored choosing session shows the candidate panel', async () => {
    saveSession(sessionOf({}));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    expect(await screen.findByRole('region', { name: 'Blue zones' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Go' }).length).toBeGreaterThan(0);
  });

  it('prompt stays when the app returns to the foreground while driving', async () => {
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1' }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByText('Found a spot?');
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(screen.getByText('Found a spot?')).toBeInTheDocument();
  });

  it('Yes ends the session', async () => {
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1' }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    expect(screen.queryByText('Found a spot?')).not.toBeInTheDocument();
    expect(storedSession().status).toBe('idle');
  });

  it('No, next zone in around mode uses a fresh origin from the current position', async () => {
    const fresh = { lat: 40.419, lng: -3.7038 };
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        watchPosition: (ok: (p: unknown) => void) => {
          ok({ coords: { latitude: fresh.lat, longitude: fresh.lng, accuracy: 5 } });
          return 1;
        },
        clearWatch: () => {},
      },
    });
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1' }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    const no = await screen.findByRole('button', { name: 'No, next zone' });
    await act(async () => {}); // let the position set by the watch effect render
    fireEvent.click(no);
    const s = storedSession();
    expect(s.status).toBe('choosing');
    expect(s.tried).toEqual(['z1']);
    expect(s.origin).toEqual({ mode: 'around', point: fresh });
  });

  it('No, next zone without a position keeps the previous origin', async () => {
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1' }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'No, next zone' }));
    expect(storedSession().origin).toEqual({ mode: 'around', point: here });
  });

  it('No, next zone in destination mode keeps the origin', async () => {
    const dest = { mode: 'destination' as const, point: here, label: 'Puerta del Sol' };
    saveSession(sessionOf({ status: 'driving', zoneId: 'z1', origin: dest }));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'No, next zone' }));
    expect(storedSession().origin).toEqual(dest);
  });

  it('after next the tried zone is gone from the list and the highlight is cleared', async () => {
    saveSettings({ showVisitor: true, showResident: true, navApp: 'google' });
    saveSession(sessionOf({}));
    vi.stubGlobal('fetch', mockFetchOk());
    render(<App />);
    await screen.findByRole('region', { name: 'Blue zones' });
    const first = screen.getAllByRole('listitem')[0]!;
    fireEvent.click(first.querySelector('.card-main') as HTMLElement);
    const selected = mapProps.highlightedZoneId;
    expect(selected).toBeTruthy();
    const before = screen.getAllByRole('listitem').length;
    fireEvent.click(first.querySelector('.btn-primary') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'No, next zone' }));
    await screen.findByRole('region', { name: 'Blue zones' });
    expect(screen.getAllByRole('listitem').length).toBe(before - 1);
    expect(storedSession().tried).toEqual([selected]);
    expect(mapProps.highlightedZoneId).toBeNull();
  });
});
