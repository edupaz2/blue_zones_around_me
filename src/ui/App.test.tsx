import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../adapters/storage';
import type { CandidateZone, Stretch } from '../core/types';
import App from '../App';
import { useAppState } from './useAppState';
import type { ZoneData } from './useZoneData';

// MapLibre needs WebGL, which jsdom lacks.
vi.mock('./MapView', () => ({ default: () => <div data-testid="map" /> }));

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
