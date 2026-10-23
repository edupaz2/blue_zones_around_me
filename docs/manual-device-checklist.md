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

### Language

- [ ] Set the phone language to Spanish and reopen the app: buttons, notes and the settings sheet are in Spanish, and the zone names read "Zona azul"/"Zona verde".
- [ ] Set it to English: the UI is English. Set it to another language (e.g. French): the UI is English.
- [ ] Spanish layout: the results panel header, the close buttons and the chooser fit without overlapping.

### Search suggestions and results panel

- [ ] Type in the search bar: tap the x on the suggestions popup. It closes and the typed text stays.
- [ ] With a search showing results: Around me is hidden. Tap the x on the results panel: the panel closes, Around me returns, and no zones are suggested.

### Address after long-press

- [ ] Long-press the map inside Madrid: the results appear at once and the panel header shows the street address a moment later; a red pin sits at the pressed spot.
- [ ] Close the panel: the pin and the address disappear.
- [ ] Offline (airplane mode, app already loaded): long-press still works, the header stays "Selected point" (no error).
- [ ] Long-press twice in quick succession at different spots: the final address and pin match the second spot (no stale address from the first).

### Hand-off

- [ ] First Go (no app saved yet): the chooser appears. Tap Cancel, then Go again and tap outside the dialog: nothing opens, the zone cards are still shown, and no app is remembered.
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

- [ ] Map style fallback: after at least one online visit, enable airplane mode and launch the app fresh (clear the cached style if needed): zone markers still show on a plain background without street names.

### Settings

- [ ] Toggle blue/green zone visibility: the map updates.
- [ ] Change the navigation app (Google Maps / Waze): Go uses the new choice after reload.

### Stale-data banner

- [ ] Hard to force on a device. To simulate: locally edit `sourceDate` in `public/data/madrid/stretches.json` and `candidates.json` to a date older than the cutoff, run the dev server over HTTPS, and confirm the banner appears. Revert the edit afterwards.

## Analytics (production URL only)

- [ ] Open the site and tap Around me, then check https://bluezones.goatcounter.com within a minute: a page view and the "Around me" event are counted.
- [ ] Turn on Do Not Track (or a tracking-protection setting that sends it) and repeat: nothing new is counted.
- [ ] Local or LAN dev servers never count anything.

## Deploy check

- [ ] After a merge to `main`, the latest GitHub Actions run for the newest `main` commit deployed (not skipped by the deploy guard), and the live site shows the newest feature after a reload (the service worker updates automatically; reload twice if needed).

## Open risk: iOS installed PWA hand-off

`src/ui/openNavigation.ts` uses `window.open(url, '_blank', 'noopener')`.

- [ ] On the installed iOS PWA, verify Go opens the Google Maps / Waze app and not an in-app browser or a blank tab.
- [ ] If it does not, switch to `window.location.assign(url)` in `src/ui/openNavigation.ts` and re-check that the "Found a spot?" prompt still appears on return (the persisted session should restore it).
