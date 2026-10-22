import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FoundSpotPrompt from './FoundSpotPrompt';
import NavAppChooser from './NavAppChooser';

afterEach(cleanup);

describe('FoundSpotPrompt', () => {
  it('shows the question with Yes and No buttons and focuses the first', () => {
    render(<FoundSpotPrompt onFound={() => {}} onNext={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Found a spot?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'No, next zone' })).toBeInTheDocument();
  });

  it('calls onFound and onNext', () => {
    const onFound = vi.fn();
    const onNext = vi.fn();
    render(<FoundSpotPrompt onFound={onFound} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onFound).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'No, next zone' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('NavAppChooser', () => {
  it('reports the chosen app', () => {
    const onChoose = vi.fn();
    render(<NavAppChooser onChoose={onChoose} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Waze' }));
    expect(onChoose).toHaveBeenCalledWith('waze');
    fireEvent.click(screen.getByRole('button', { name: 'Google Maps' }));
    expect(onChoose).toHaveBeenCalledWith('google');
  });
});
