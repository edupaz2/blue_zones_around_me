export const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#eef2f6' } }],
};

/**
 * Fetch the basemap style defensively. On any failure (network, HTTP error,
 * timeout, invalid JSON) fall back to a blank inline style so zone markers
 * still render. `fallback: true` means no glyphs/sprites are available.
 */
export async function resolveStyle(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 6000,
): Promise<{ style: string | object; fallback: boolean }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Style HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (typeof json !== 'object' || json === null) throw new Error('Invalid style');
    return { style: json, fallback: false };
  } catch {
    return { style: FALLBACK_STYLE, fallback: true };
  } finally {
    clearTimeout(timer);
  }
}
