import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FoundSpotPrompt from './FoundSpotPrompt';
import NavAppChooser from './NavAppChooser';

afterEach(cleanup);

describe('FoundSpotPrompt', () => {
  it('shows the question with Yes and No buttons and focuses the first', () => {
    render(<FoundSpotPrompt onFound={() => {}} onNext={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Found a spot?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'No, next zone' })).toBeInTheDocument();
  });

  it('calls onFound and onNext', () => {
    const onFound = vi.fn();
    const onNext = vi.fn();
    render(<FoundSpotPrompt onFound={onFound} onNext={onNext} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onFound).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'No, next zone' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed with the close button or Escape', () => {
    const onFound = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();
    render(<FoundSpotPrompt onFound={onFound} onNext={onNext} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onFound).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('NavAppChooser', () => {
  it('reports the chosen app', () => {
    const onChoose = vi.fn();
    render(<NavAppChooser onChoose={onChoose} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Waze' }));
    expect(onChoose).toHaveBeenCalledWith('waze');
    fireEvent.click(screen.getByRole('button', { name: 'Google Maps' }));
    expect(onChoose).toHaveBeenCalledWith('google');
  });

  it('can be dismissed with the Cancel button', () => {
    const onChoose = vi.fn();
    const onCancel = vi.fn();
    render(<NavAppChooser onChoose={onChoose} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('can be dismissed with Escape', () => {
    const onCancel = vi.fn();
    render(<NavAppChooser onChoose={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed by tapping outside the dialog, but not by tapping inside it', () => {
    const onCancel = vi.fn();
    const { container } = render(<NavAppChooser onChoose={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.modal-backdrop')!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
