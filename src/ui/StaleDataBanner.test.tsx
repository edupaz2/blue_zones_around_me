import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StaleDataBanner from './StaleDataBanner';

afterEach(cleanup);
const now = Date.UTC(2026, 9, 22);

describe('StaleDataBanner', () => {
  it('is hidden for 5-month-old data', () => {
    render(<StaleDataBanner sourceDate="2026-05-22" now={now} />);
    expect(screen.queryByText(/Consider refreshing/)).toBeNull();
  });
  it('is shown for 7-month-old data', () => {
    render(<StaleDataBanner sourceDate="2026-03-22" now={now} />);
    expect(
      screen.getByText('Zone data is from 2026-03-22. Consider refreshing it.'),
    ).toBeInTheDocument();
  });
  it('renders nothing for invalid dates', () => {
    for (const bad of ['nope', '']) {
      const { container } = render(<StaleDataBanner sourceDate={bad} now={now} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  const shown = (d: string, at: number) => {
    const { container } = render(<StaleDataBanner sourceDate={d} now={at} />);
    const text = container.textContent;
    cleanup();
    return text !== '';
  };

  it('exactly 6 months is not stale even at a non-midnight now; one day more is', () => {
    const at = Date.UTC(2026, 9, 22, 15);
    expect(shown('2026-04-22', at)).toBe(false);
    expect(shown('2026-04-21', at)).toBe(true);
  });

  it('clamps month ends: 31 Aug 2026 -> 28 Feb 2026', () => {
    const at = Date.UTC(2026, 7, 31, 12);
    expect(shown('2026-02-28', at)).toBe(false);
    expect(shown('2026-02-27', at)).toBe(true);
  });

  it('handles leap days: 31 Aug 2028 -> 29 Feb 2028', () => {
    const at = Date.UTC(2028, 7, 31, 12);
    expect(shown('2028-02-29', at)).toBe(false);
    expect(shown('2028-02-28', at)).toBe(true);
  });

  it('handles year rollover: 15 Mar 2027 -> 15 Sep 2026', () => {
    const at = Date.UTC(2027, 2, 15, 9);
    expect(shown('2026-09-15', at)).toBe(false);
    expect(shown('2026-09-14', at)).toBe(true);
  });
});
