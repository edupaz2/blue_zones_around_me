export interface PressPoint {
  pointerId: number;
  isPrimary: boolean;
  x: number;
  y: number;
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * DOM-free long-press tracker. Arms only for a lone primary pointer, cancels
 * on movement beyond the slop of that same pointer, on any additional
 * pointer (multi-touch), and stays disarmed until every pointer is up.
 */
export function createLongPress(
  onFire: (p: PressPoint) => void,
  opts: { delayMs: number; slopPx: number; timers?: Timers },
) {
  const timers = opts.timers ?? realTimers;
  const active = new Set<number>();
  let handle: unknown;
  let armed: PressPoint | null = null;

  const cancel = () => {
    if (handle !== undefined) timers.clear(handle);
    handle = undefined;
    armed = null;
  };

  return {
    down(p: PressPoint) {
      active.add(p.pointerId);
      if (active.size > 1 || !p.isPrimary) {
        cancel();
        return;
      }
      cancel();
      armed = p;
      handle = timers.set(() => {
        const fired = armed;
        handle = undefined;
        armed = null;
        if (fired) onFire(fired);
      }, opts.delayMs);
    },
    move(p: PressPoint) {
      if (!armed || p.pointerId !== armed.pointerId) return;
      if (Math.hypot(p.x - armed.x, p.y - armed.y) > opts.slopPx) cancel();
    },
    up(pointerId: number) {
      active.delete(pointerId);
      cancel();
    },
    cancel() {
      cancel();
    },
    /** Cancel and forget all pointers (e.g. on teardown). */
    reset() {
      active.clear();
      cancel();
    },
  };
}
