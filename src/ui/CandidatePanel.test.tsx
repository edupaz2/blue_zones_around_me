import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankResult } from '../core/ranking';
import type { CandidateZone } from '../core/types';
import CandidatePanel from './CandidatePanel';

afterEach(cleanup);

const zone = (id: string, streets: string[], spaces: number): CandidateZone => ({
  id,
  city: 'madrid',
  neighbourhood: 'Centro',
  stretchIds: [],
  streets,
  totalSpaces: spaces,
  centroid: { lat: 40.4, lng: -3.7 },
  target: { lat: 40.4, lng: -3.7 },
});
const result: RankResult = {
  radiusM: 2000,
  ranked: [
    { zone: zone('a', ['CALLE A'], 7), distanceM: 350 },
    { zone: zone('b', ['CALLE B', 'CALLE C', 'CALLE D'], 12), distanceM: 1230 },
    { zone: zone('c', ['CALLE E'], 3), distanceM: 1900 },
  ],
};

function setup(r: RankResult = result, mode: 'destination' | 'around' = 'destination') {
  const fns = { onSelect: vi.fn(), onGo: vi.fn(), onWiden: vi.fn() };
  render(<CandidatePanel result={r} mode={mode} selectedId={null} {...fns} />);
  return fns;
}

describe('CandidatePanel', () => {
  it('renders three cards with name, spaces and formatted distance', () => {
    setup();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('350 m')).toBeInTheDocument();
    expect(screen.getByText('1.2 km')).toBeInTheDocument();
    expect(screen.getByText(/CALLE A/)).toBeInTheDocument();
    expect(screen.getByText(/CALLE B, CALLE C \+1 more/)).toBeInTheDocument();
    expect(screen.getByText(/12 blue spaces/)).toBeInTheDocument();
  });

  it('labels distance by mode', () => {
    setup(result, 'around');
    expect(screen.getAllByText(/from you/).length).toBe(3);
  });

  it('select and go call back with the id', () => {
    const f = setup();
    fireEvent.click(screen.getAllByRole('button', { name: /Show .* on map/ })[1]!);
    expect(f.onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getAllByRole('button', { name: 'Go' })[0]!);
    expect(f.onGo).toHaveBeenCalledWith('a');
  });

  it('shows none-left message and Widen when empty', () => {
    const f = setup({ ranked: [], radiusM: null });
    expect(screen.getByText('No more blue zones nearby')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Widen search' }));
    expect(f.onWiden).toHaveBeenCalled();
  });
});
