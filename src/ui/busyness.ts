/** Typical availability of blue spaces per barrio, weekday and hour (see scripts/build-busyness.py). */
export interface BusynessTable {
  days: { from: string; to: string };
  barrios: Record<string, { name: string; spaces: number; avail: (number | null)[][] }>;
  byZone: Record<string, string>;
}

export interface HourSlot {
  /** Hours relative to now: -2 … +2. */
  offset: number;
  /** Clock hour 0–23 (Madrid time). */
  hour: number;
  /** Usual % of blue spaces free; null when the zone is not regulated at that hour. */
  pct: number | null;
}

export const OFFSETS = [-2, -1, 0, 1, 2] as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Weekday (Mon=0) and hour in Madrid, whatever the device time zone. */
export function madridNow(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: Math.max(0, WEEKDAYS.indexOf(get('weekday'))), hour: Number(get('hour')) % 24 };
}

/** The five hourly slots around now for a zone, or null when we have no history for it. */
export function hourSlots(table: BusynessTable, zoneId: string, now: Date): HourSlot[] | null {
  const code = table.byZone[zoneId];
  const avail = code ? table.barrios[code]?.avail : undefined;
  if (!avail) return null;
  const { weekday, hour } = madridNow(now);
  return OFFSETS.map((offset) => {
    const slot = (((weekday * 24 + hour + offset) % 168) + 168) % 168;
    return { offset, hour: slot % 24, pct: avail[Math.floor(slot / 24)]?.[slot % 24] ?? null };
  });
}

function isTable(x: unknown): x is BusynessTable {
  const t = x as Partial<BusynessTable> | null;
  return !!t && typeof t.barrios === 'object' && typeof t.byZone === 'object' && !!t.days;
}

let cached: Promise<BusynessTable> | null = null;

/** Fetched on first use only (a ~50 KB file), then reused; a failure is not cached. */
export function loadBusyness(): Promise<BusynessTable> {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/madrid/busyness.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((json) => {
      if (!isTable(json)) throw new Error('Invalid busyness data');
      return json;
    })
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}
