import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AroundMeButton from './AroundMeButton';

afterEach(cleanup);
const inside = { point: { lat: 40.4168, lng: -3.7038 }, accuracyM: 10 };

describe('AroundMeButton', () => {
  it('is disabled with instructions when denied', () => {
    render(<AroundMeButton position={null} locationStatus="denied" onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Around me' })).toBeDisabled();
    expect(screen.getByText(/Safari Websites/)).toBeInTheDocument();
    expect(screen.getByText(/Android Chrome/)).toBeInTheDocument();
  });

  it('is disabled when unavailable', () => {
    render(<AroundMeButton position={null} locationStatus="unavailable" onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Around me' })).toBeDisabled();
  });

  it('shows outside message and does not call onPress', () => {
    const onPress = vi.fn();
    const p = { point: { lat: 41.4, lng: 2.17 }, accuracyM: 10 };
    render(<AroundMeButton position={p} locationStatus="granted" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Around me' }));
    expect(screen.getByText("You're outside the Madrid SER area")).toBeInTheDocument();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('calls onPress with an around origin when inside', () => {
    const onPress = vi.fn();
    render(<AroundMeButton position={inside} locationStatus="granted" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Around me' }));
    expect(onPress).toHaveBeenCalledWith({ mode: 'around', point: inside.point });
  });
});
