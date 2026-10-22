import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLongPress } from './longPress';
import type { PressPoint } from './longPress';

const pt = (id: number, x = 0, y = 0, isPrimary = id === 1): PressPoint => ({
  pointerId: id,
  isPrimary,
  x,
  y,
});

let onFire: ReturnType<typeof vi.fn<(p: PressPoint) => void>>;
let lp: ReturnType<typeof createLongPress>;

beforeEach(() => {
  vi.useFakeTimers();
  onFire = vi.fn<(p: PressPoint) => void>();
  lp = createLongPress(onFire, { delayMs: 600, slopPx: 10 });
});

describe('createLongPress', () => {
  it('fires after the delay for a stationary primary pointer', () => {
    lp.down(pt(1, 5, 6));
    vi.advanceTimersByTime(599);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledWith(pt(1, 5, 6));
  });

  it('cancels on release or when moved beyond the slop', () => {
    lp.down(pt(1));
    lp.up(1);
    vi.advanceTimersByTime(700);
    lp.down(pt(1));
    lp.move(pt(1, 11, 0));
    vi.advanceTimersByTime(700);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('tolerates small movement', () => {
    lp.down(pt(1));
    lp.move(pt(1, 5, 5));
    vi.advanceTimersByTime(600);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('a second finger cancels and does not re-arm (two fingers held)', () => {
    lp.down(pt(1));
    lp.down(pt(2));
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('stays disarmed until all pointers are up, then arms again', () => {
    lp.down(pt(1));
    lp.down(pt(2));
    lp.up(2);
    lp.down(pt(3, 0, 0, false));
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
    lp.up(1);
    lp.up(3);
    lp.down(pt(1));
    vi.advanceTimersByTime(600);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('ignores moves of other pointers and non-primary starts', () => {
    lp.down(pt(1));
    lp.move(pt(2, 500, 500));
    vi.advanceTimersByTime(600);
    expect(onFire).toHaveBeenCalledTimes(1);
    lp.up(1);
    lp.down(pt(7, 0, 0, false));
    vi.advanceTimersByTime(1000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('cancel() (map movestart backstop) stops the press', () => {
    lp.down(pt(1));
    lp.cancel();
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
  });
});
