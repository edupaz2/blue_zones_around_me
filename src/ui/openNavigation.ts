/**
 * Opens the navigation deep link in a new browsing context. A new tab/window
 * (rather than location.assign) keeps this PWA's document alive, so the
 * `driving` session and the "Found a spot?" prompt are still there when the
 * user switches back; if iOS reloads it anyway, the persisted session restores.
 */
export function openNavigation(url: string): void {
  window.open(url, '_blank', 'noopener');
}
