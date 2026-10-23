import { afterEach, describe, expect, it, vi } from 'vitest';
import { onAppReturn } from './appVisibility';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
}
afterEach(() => setVisibility('visible'));

describe('onAppReturn', () => {
  it('fires on visibilitychange when visible', () => {
    const cb = vi.fn();
    const off = onAppReturn(cb);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not fire when hidden', () => {
    const cb = vi.fn();
    const off = onAppReturn(cb);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('fires on pageshow', () => {
    const cb = vi.fn();
    const off = onAppReturn(cb);
    window.dispatchEvent(new Event('pageshow'));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('unsubscribes', () => {
    const cb = vi.fn();
    const off = onAppReturn(cb);
    off();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    expect(cb).not.toHaveBeenCalled();
  });
});
