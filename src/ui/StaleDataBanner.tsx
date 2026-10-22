interface Props {
  sourceDate: string;
  now: number;
}

// Rule: data is stale when sourceDate is strictly before (now minus 6 calendar
// months), computed on a UTC copy via setUTCMonth. Invalid dates are never stale.
export function isStale(sourceDate: string, now: number): boolean {
  const source = Date.parse(sourceDate);
  if (Number.isNaN(source)) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  return source < cutoff.getTime();
}

export default function StaleDataBanner({ sourceDate, now }: Props) {
  if (!isStale(sourceDate, now)) return null;
  return (
    <p className="note stale-banner" role="status">
      Zone data is from {sourceDate}. Consider refreshing it.
    </p>
  );
}
