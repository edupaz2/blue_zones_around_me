import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoResult } from '../adapters/geocoder';
import SearchBar from './SearchBar';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function type(text: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe('SearchBar', () => {
  it('debounces, shows suggestions and selects', async () => {
    const r = { label: 'Plaza Mayor', point: { lat: 40.41, lng: -3.7 } };
    const search = vi.fn(() => Promise.resolve([r]));
    const onSelect = vi.fn();
    render(<SearchBar onSelect={onSelect} search={search} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pl' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plaza' } });
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Plaza Mayor' }));
    expect(onSelect).toHaveBeenCalledWith(r);
  });

  it('ignores a stale slow response arriving after a later query', async () => {
    const resolvers: Array<(r: GeoResult[]) => void> = [];
    const search = vi.fn(() => new Promise<GeoResult[]>((resolve) => resolvers.push(resolve)));
    render(<SearchBar onSelect={vi.fn()} search={search} />);
    await type('aaa');
    await type('bbb');
    expect(resolvers).toHaveLength(2);
    await act(async () => {
      resolvers[1]!([{ label: 'New', point: { lat: 40.4, lng: -3.7 } }]);
    });
    await act(async () => {
      resolvers[0]!([{ label: 'Stale', point: { lat: 40.4, lng: -3.7 } }]);
    });
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stale' })).not.toBeInTheDocument();
  });

  it('clears suggestions on empty/whitespace query without searching', async () => {
    const search = vi.fn(() =>
      Promise.resolve([{ label: 'Plaza', point: { lat: 40.4, lng: -3.7 } }]),
    );
    render(<SearchBar onSelect={vi.fn()} search={search} />);
    await type('plaza');
    expect(screen.getByRole('button', { name: 'Plaza' })).toBeInTheDocument();
    await type('   ');
    expect(screen.queryByRole('button', { name: 'Plaza' })).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('clears the list after selecting a suggestion', async () => {
    const search = vi.fn(() =>
      Promise.resolve([{ label: 'Plaza', point: { lat: 40.4, lng: -3.7 } }]),
    );
    render(<SearchBar onSelect={vi.fn()} search={search} />);
    await type('plaza');
    fireEvent.click(screen.getByRole('button', { name: 'Plaza' }));
    expect(screen.queryByRole('button', { name: 'Plaza' })).not.toBeInTheDocument();
  });

  describe('closing the suggestions popup', () => {
    const plaza = { label: 'Plaza', point: { lat: 40.4, lng: -3.7 } };
    const closeButton = () => screen.queryByRole('button', { name: 'Close suggestions' });

    it('has no close button while nothing is shown', async () => {
      render(<SearchBar onSelect={vi.fn()} search={() => Promise.resolve([plaza])} />);
      expect(closeButton()).not.toBeInTheDocument();
    });

    it('closes the suggestions, keeps the typed text and does not select or re-search', async () => {
      const search = vi.fn(() => Promise.resolve([plaza]));
      const onSelect = vi.fn();
      render(<SearchBar onSelect={onSelect} search={search} />);
      await type('plaza');
      fireEvent.click(closeButton()!);
      expect(screen.queryByRole('button', { name: 'Plaza' })).not.toBeInTheDocument();
      expect(closeButton()).not.toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toHaveValue('plaza');
      expect(onSelect).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(search).toHaveBeenCalledTimes(1);
    });

    it('also closes the "no results" message', async () => {
      render(<SearchBar onSelect={vi.fn()} search={() => Promise.resolve([])} />);
      await type('zzz');
      expect(screen.getByText(/No results/)).toBeInTheDocument();
      fireEvent.click(closeButton()!);
      expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
      expect(closeButton()).not.toBeInTheDocument();
    });

    it('ignores a slow response that arrives after the popup was closed', async () => {
      const resolvers: Array<(r: GeoResult[]) => void> = [];
      const search = vi.fn(() => new Promise<GeoResult[]>((resolve) => resolvers.push(resolve)));
      render(<SearchBar onSelect={vi.fn()} search={search} />);
      await type('aaa');
      await act(async () => {
        resolvers[0]!([plaza]);
      });
      await type('aaab');
      fireEvent.click(closeButton()!);
      await act(async () => {
        resolvers[1]!([{ label: 'Late', point: { lat: 40.4, lng: -3.7 } }]);
      });
      expect(screen.queryByRole('button', { name: 'Late' })).not.toBeInTheDocument();
      expect(closeButton()).not.toBeInTheDocument();
    });

    it('Escape in the search box closes the popup without clearing the text', async () => {
      render(<SearchBar onSelect={vi.fn()} search={() => Promise.resolve([plaza])} />);
      await type('plaza');
      const box = screen.getByRole('searchbox');
      // fireEvent returns false when the handler called preventDefault (which stops the
      // browser from clearing a type="search" field on Escape).
      expect(fireEvent.keyDown(box, { key: 'Escape' })).toBe(false);
      expect(screen.queryByRole('button', { name: 'Plaza' })).not.toBeInTheDocument();
      expect(box).toHaveValue('plaza');
    });

    it('Escape does nothing special when no popup is open', async () => {
      render(<SearchBar onSelect={vi.fn()} search={() => Promise.resolve([plaza])} />);
      expect(fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })).toBe(true);
    });

    it('typing again after closing shows fresh suggestions', async () => {
      const search = vi
        .fn()
        .mockResolvedValueOnce([plaza])
        .mockResolvedValueOnce([{ label: 'Prado', point: { lat: 40.41, lng: -3.69 } }]);
      render(<SearchBar onSelect={vi.fn()} search={search} />);
      await type('plaza');
      fireEvent.click(closeButton()!);
      await type('prado');
      expect(screen.getByRole('button', { name: 'Prado' })).toBeInTheDocument();
      expect(closeButton()).toBeInTheDocument();
    });
  });

  it('shows the long-press hint when search rejects', async () => {
    render(<SearchBar onSelect={vi.fn()} search={() => Promise.reject(new Error('offline'))} />);
    await type('plaza');
    expect(screen.getByText(/long-press the map to set a destination/)).toBeInTheDocument();
  });

  it('shows the long-press hint on no results', async () => {
    render(<SearchBar onSelect={vi.fn()} search={() => Promise.resolve([])} />);
    await type('zzz');
    expect(screen.getByText(/No results/)).toBeInTheDocument();
    expect(screen.getByText(/long-press the map to set a destination/)).toBeInTheDocument();
  });
});
