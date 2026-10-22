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
  it('renders nothing for an invalid date', () => {
    const { container } = render(<StaleDataBanner sourceDate="nope" now={now} />);
    expect(container).toBeEmptyDOMElement();
  });
});
