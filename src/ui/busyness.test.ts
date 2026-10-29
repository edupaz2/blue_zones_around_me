import { describe, expect, it } from 'vitest';
import { hourSlots, madridNow } from './busyness';
import type { BusynessTable } from './busyness';

// Tuesday (index 1) is 100 - hour, other days all closed.
const tue = Array.from({ length: 24 }, (_, h) => (h < 9 || h > 20 ? null : 100 - h));
const closed = Array.from({ length: 24 }, () => null);
const table: BusynessTable = {
  days: { from: '2026-01-02', to: '2026-10-01' },
  barrios: {
    '24': {
      name: 'Legazpi',
      spaces: 500,
      avail: [closed, tue, closed, closed, closed, closed, closed],
    },
  },
  byZone: { z1: '24' },
};

describe('madridNow', () => {
  it('uses Madrid time (CEST = UTC+2 in July) and Monday as day 0', () => {
    expect(madridNow(new Date('2026-07-14T12:30:00Z'))).toEqual({ weekday: 1, hour: 14 });
    expect(madridNow(new Date('2026-07-13T22:30:00Z'))).toEqual({ weekday: 1, hour: 0 });
  });
});

describe('hourSlots', () => {
  it('returns -2h..+2h around the current Madrid hour', () => {
    // Tuesday 14:30 Madrid
    const slots = hourSlots(table, 'z1', new Date('2026-07-14T12:30:00Z'));
    expect(slots?.map((s) => [s.offset, s.hour, s.pct])).toEqual([
      [-2, 12, 88],
      [-1, 13, 87],
      [0, 14, 86],
      [1, 15, 85],
      [2, 16, 84],
    ]);
  });

  it('wraps across midnight into the next weekday and gives null when not regulated', () => {
    // Tuesday 23:10 Madrid -> +1h and +2h fall on Wednesday (closed)
    const slots = hourSlots(table, 'z1', new Date('2026-07-14T21:10:00Z'));
    expect(slots?.map((s) => s.pct)).toEqual([null, null, null, null, null]);
    // Tuesday 20:15 Madrid -> 18, 19, 20 open, 21 and 22 closed
    const evening = hourSlots(table, 'z1', new Date('2026-07-14T18:15:00Z'));
    expect(evening?.map((s) => s.pct)).toEqual([82, 81, 80, null, null]);
  });

  it('returns null for a zone without history', () => {
    expect(hourSlots(table, 'unknown', new Date())).toBeNull();
  });
});
