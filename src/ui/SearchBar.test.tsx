import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
