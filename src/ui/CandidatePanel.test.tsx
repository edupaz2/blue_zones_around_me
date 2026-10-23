import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankResult } from '../core/ranking';
import type { CandidateZone } from '../core/types';
import CandidatePanel, { formatDistance } from './CandidatePanel';

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

function setup(
  r: RankResult = result,
  mode: 'destination' | 'around' = 'destination',
  destinationLabel?: string,
) {
  const fns = { onSelect: vi.fn(), onGo: vi.fn(), onWiden: vi.fn(), onClose: vi.fn() };
  render(
    <CandidatePanel
      result={r}
      mode={mode}
      selectedId={null}
      destinationLabel={destinationLabel}
      {...fns}
    />,
  );
  return fns;
}

describe('formatDistance', () => {
  it.each([
    [999, '999 m'],
    [999.6, '1.0 km'],
    [1000, '1.0 km'],
    [1250, '1.3 km'],
  ])('%s -> %s', (m, expected) => {
    expect(formatDistance(m)).toBe(expected);
  });
});

describe('CandidatePanel', () => {
  it('shows a pin Go only when onGoToPin is given', () => {
    const onGoToPin = vi.fn();
    render(
      <CandidatePanel
        result={result}
        mode="destination"
        selectedId={null}
        onSelect={vi.fn()}
        onGo={vi.fn()}
        onGoToPin={onGoToPin}
        onWiden={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go to the pin' }));
    expect(onGoToPin).toHaveBeenCalled();
    cleanup();
    setup();
    expect(screen.queryByRole('button', { name: 'Go to the pin' })).toBeNull();
  });

  it('falls back to the neighbourhood when a zone has no streets', () => {
    setup({ radiusM: 800, ranked: [{ zone: zone('n', [], 4), distanceM: 100 }] });
    expect(screen.getByRole('button', { name: 'Show Centro on map' })).toBeInTheDocument();
  });

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

  it('has a close button with the list that calls onClose', () => {
    const f = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close results' }));
    expect(f.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('has a close button in the empty state too', () => {
    const f = setup({ ranked: [], radiusM: null });
    fireEvent.click(screen.getByRole('button', { name: 'Close results' }));
    expect(f.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Widen search' })).toBeInTheDocument();
  });

  it('shows the destination label in the header, with the list and when empty', () => {
    const f = setup(result, 'destination', 'Calle Mayor 1, Centro, Madrid');
    const header = document.querySelector('.panel-header')!;
    expect(header).toHaveTextContent('Calle Mayor 1, Centro, Madrid');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Close results' }));
    expect(f.onClose).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ ranked: [], radiusM: null }, 'destination', 'Calle Mayor 1');
    expect(document.querySelector('.panel-header')).toHaveTextContent('Calle Mayor 1');
  });

  it('shows no address text without a destination label', () => {
    setup(result, 'around');
    expect(document.querySelector('.panel-header')).toHaveTextContent(/^×$/);
    cleanup();
    setup({ ranked: [], radiusM: null });
    expect(document.querySelector('.panel-header')).toHaveTextContent(/^×$/);
  });
});
