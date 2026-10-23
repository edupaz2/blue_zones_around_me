import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../adapters/storage';
import type { CandidateZone, SessionState } from '../core/types';
import App from '../App';
import { I18nProvider } from '../i18n';

vi.mock('./MapView', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('../adapters/geocoder', () => ({ searchPlaces: vi.fn(() => Promise.resolve([])) }));

// About 1.2 km north of the origin used by `choosing` below.
const zone: CandidateZone = {
  id: 'z1',
  city: 'madrid',
  neighbourhood: 'Centro',
  stretchIds: ['s1'],
  streets: ['CALLE X'],
  totalSpaces: 10,
  centroid: { lat: 40.4276, lng: -3.7038 },
  target: { lat: 40.4276, lng: -3.7038 },
};
const stretch = {
  id: 's1',
  city: 'madrid',
  neighbourhood: 'Centro',
  street: 'CALLE X',
  kind: 'visitor',
  spaces: 10,
  lat: 40.4168,
  lng: -3.7038,
};

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sourceDate: '2026-09-30',
            generatedAt: 'g',
            items: url.endsWith('stretches.json') ? [stretch] : [zone],
          }),
      }),
    ),
  );
}

function stubLanguages(languages: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(languages[0]);
}

const choosing: SessionState = {
  status: 'choosing',
  origin: { mode: 'destination', point: { lat: 40.4168, lng: -3.7038 }, label: 'x' },
  zoneId: null,
  tried: [],
  lastActivityAt: Date.now(),
};

beforeEach(() => {
  mockFetch();
  stubLanguages(['es-ES', 'en']);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.lang = 'en';
});

describe('App in Spanish', () => {
  it('renders the idle UI in Spanish and sets <html lang>', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Cerca de mí' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('¿Adónde vas?')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe('Zonas azules cerca de mí');
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByText('Fecha de los datos: 30 de septiembre de 2026')).toBeInTheDocument();
  });

  it('shows the loading text before data arrives', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando zonas…');
  });

  it('restores a driving session with the Spanish prompt', async () => {
    saveSession({ ...choosing, status: 'driving', zoneId: 'z1' });
    render(<App />);
    expect(await screen.findByRole('dialog', { name: '¿Has encontrado sitio?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sí' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, siguiente zona' })).toBeInTheDocument();
  });

  it('shows cards with a decimal comma and the Go chooser in Spanish', async () => {
    saveSession(choosing);
    render(<App />);
    expect(await screen.findByText(/10 plazas azules/)).toBeInTheDocument();
    expect(screen.getByText(/1,2 km/)).toBeInTheDocument();
    expect(screen.getByText(/del destino/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }));
    expect(screen.getByRole('dialog', { name: 'Navegar con' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('falls back to English for unsupported languages', async () => {
    stubLanguages(['fr-FR']);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Around me' })).toBeInTheDocument();
  });
});
