import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateZone } from '../core/types';
import BusynessPopup from './BusynessPopup';

afterEach(cleanup);

const zone: CandidateZone = {
  id: 'z1',
  city: 'madrid',
  neighbourhood: 'Legazpi',
  stretchIds: [],
  streets: [],
  totalSpaces: 10,
  centroid: { lat: 40.4, lng: -3.7 },
  target: { lat: 40.4, lng: -3.7 },
};
const tue = Array.from({ length: 24 }, (_, h) => (h < 9 || h > 20 ? null : 100 - h));
const closed = Array.from({ length: 24 }, () => null);
const table = {
  days: { from: '2026-01-02', to: '2026-10-01' },
  barrios: {
    '24': {
      name: 'Legazpi',
      spaces: 500,
      avail: [closed, tue, closed, closed, closed, closed, closed],
    },
  },
  byZone: { z1: '24' },
};

describe('BusynessPopup', () => {
  it('shows the usual availability from -2h to +2h and closes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(table) })),
    );
    const onClose = vi.fn();
    // Tuesday 14:30 Madrid (CEST)
    render(<BusynessPopup zone={zone} onClose={onClose} now={new Date('2026-07-14T12:30:00Z')} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('86%')).toBeInTheDocument();
    for (const pct of ['88%', '87%', '85%', '84%']) {
      expect(screen.getByText(pct)).toBeInTheDocument();
    }
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
