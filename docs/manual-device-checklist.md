# Manual device checklist

Run on the deployed URL (https://edupaz2.github.io/blue_zones_around_me/) or a local
HTTPS dev server (see README). Repeat the whole list on both platforms.

## iPhone (Safari)

- [ ] Open the URL in Safari, then Share > Add to Home Screen. The icon and name are correct.
- [ ] Launch from the home screen: it opens standalone (no Safari bars).

## Android (Chrome)

- [ ] Open the URL in Chrome, then menu > Install app (or the install prompt). The icon and name are correct.
- [ ] Launch from the launcher: it opens standalone.

## Both platforms

### Location

- [ ] Grant the permission: the blue dot appears and the map centres sensibly.
- [ ] Deny the permission (reset it in system settings first): the denied note is shown and destination search still works.
- [ ] "Around me" with GPS shows up to 3 blue zone cards, nearest first.

### Search

- [ ] Search a destination: the suggestions list appears and picking one shows 3 zones near it.
- [ ] Long-press on the map sets a destination (fallback when search fails or is offline).

### Hand-off

- [ ] Go > Google Maps: the Google Maps app opens with the route to the zone (universal link, not the browser).
- [ ] Return to the PWA: the "Found a spot?" prompt appears.
- [ ] Answer Yes: the session ends and the app returns to the idle state.
- [ ] Repeat Go, answer No / next zone: the zone is marked tried and a different set of zones is suggested.
- [ ] Repeat the same flows with Waze.
- [ ] Force-quit the PWA while "driving", reopen it: the "Found a spot?" prompt is restored.

### Offline

- [ ] After a first online load, enable airplane mode and relaunch: the app loads.
- [ ] Zones are drawn, ranking works, "Around me" works (GPS needs no network), the tried list persists.
- [ ] Map tiles may be blank in areas not viewed before; this is expected.

### Settings

- [ ] Toggle blue/green zone visibility: the map updates.
- [ ] Change the navigation app (Google Maps / Waze): Go uses the new choice after reload.

### Stale-data banner

- [ ] Hard to force on a device. To simulate: locally edit `sourceDate` in `public/data/madrid/stretches.json` and `candidates.json` to a date older than the cutoff, run the dev server over HTTPS, and confirm the banner appears. Revert the edit afterwards.

## Open risk: iOS installed PWA hand-off

`src/ui/openNavigation.ts` uses `window.open(url, '_blank', 'noopener')`.

- [ ] On the installed iOS PWA, verify Go opens the Google Maps / Waze app and not an in-app browser or a blank tab.
- [ ] If it does not, switch to `window.location.assign(url)` in `src/ui/openNavigation.ts` and re-check that the "Found a spot?" prompt still appears on return (the persisted session should restore it).
