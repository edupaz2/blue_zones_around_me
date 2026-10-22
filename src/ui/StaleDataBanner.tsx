interface Props {
  sourceDate: string;
  now: number;
}

// Rule: take the UTC calendar date of `now` (time of day ignored), subtract 6
// calendar months, clamping the day to the target month's length (31 Aug ->
// 28 Feb). Data is stale only when sourceDate is strictly before that cutoff
// date, so exactly 6 months old is not stale. Invalid dates are never stale.
export function isStale(sourceDate: string, now: number): boolean {
  const source = Date.parse(sourceDate);
  if (Number.isNaN(source)) return false;
  const n = new Date(now);
  const month = n.getUTCMonth() - 6;
  const year = n.getUTCFullYear();
  // Day 0 of the following month = last day of the target month (handles year rollover).
  const daysInTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cutoff = Date.UTC(year, month, Math.min(n.getUTCDate(), daysInTarget));
  return source < cutoff;
}

export default function StaleDataBanner({ sourceDate, now }: Props) {
  if (!isStale(sourceDate, now)) return null;
  return (
    <p className="note stale-banner" role="status">
      Zone data is from {sourceDate}. Consider refreshing it.
    </p>
  );
}
