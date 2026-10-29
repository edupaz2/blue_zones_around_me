import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { madridConfig } from '../cities/madrid/config';
import LegendDrawer from './LegendDrawer';
import { METERS_COLOR } from './mapColors';

afterEach(cleanup);

const colorOf = (testId: string) =>
  (screen.getByTestId(testId).querySelector('.legend-dot') as HTMLElement).style.background;

describe('LegendDrawer', () => {
  it('explains blue and green zones and the dark green parking meters', () => {
    render(<LegendDrawer onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Legend' })).toBeInTheDocument();
    expect(screen.getByTestId('legend-visitor')).toHaveTextContent('Blue zone');
    expect(screen.getByTestId('legend-resident')).toHaveTextContent('Green zone');
    expect(screen.getByTestId('legend-meter')).toHaveTextContent('Parking meter');
    // jsdom normalises hex to rgb(); compare through a probe element.
    const probe = (hex: string) => {
      const el = document.createElement('span');
      el.style.background = hex;
      return el.style.background;
    };
    expect(colorOf('legend-visitor')).toBe(probe(madridConfig.kinds.visitor.color));
    expect(colorOf('legend-resident')).toBe(probe(madridConfig.kinds.resident.color));
    expect(colorOf('legend-meter')).toBe(probe(METERS_COLOR));
  });

  it('closes with the button, Escape, and a tap on the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<LegendDrawer onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close legend' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(container.querySelector('.drawer-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
