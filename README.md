# Blue Zones Around Me

A mobile-first, installable web app (PWA) that helps you find parking in Madrid's
regulated parking area (SER). It shows the blue zones (visitor parking) and green
zones (resident parking) on a map, suggests the top 3 nearest blue zones to where
you are or to a destination you search for, and hands you off to Google Maps or Waze
to drive there. If you did not find a spot, "next zone" marks the zone as tried and
suggests another one.

Live app: https://edupaz2.github.io/blue_zones_around_me/

## Quick start

Requires Node 22.12 or newer (`.nvmrc` pins the version used in CI).

```sh
npm ci
npm run dev
```

## Scripts

| Script                | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Vite dev server                                                  |
| `npm run build`       | Type check, then production build into `dist/`                   |
| `npm run lint`        | ESLint                                                           |
| `npm run typecheck`   | `tsc --noEmit`                                                   |
| `npm run format`      | Prettier check (use `npx prettier --write .` to fix)             |
| `npm test`            | Vitest unit and UI tests                                         |
| `npm run test:e2e`    | Playwright end-to-end tests (builds and previews the app itself) |
| `npm run data:madrid` | Refresh the Madrid zone data in `public/data/madrid/`            |

## Project structure

```
src/core/       Pure logic: geo maths, ranking, hand-off URLs, session state machine, types
src/analytics/  Privacy-friendly GoatCounter tracking (fixed event names only)
src/adapters/   Browser boundaries: geolocation, geocoder (Photon), storage, app visibility
src/cities/     Per-city configuration (src/cities/madrid/config.ts)
src/ui/         React components, map layers, hooks, CSS
scripts/        Data pipeline (build-data, validate, group) and per-city parsers (scripts/cities/madrid)
public/data/    Generated data: stretches.json and candidates.json per city
e2e/            Playwright tests
docs/           Design spec, plan and the manual device checklist
```

## Data refresh

Data refresh is manual and meant to be run now and then (for example quarterly):

```sh
npm run data:madrid
```

The script:

1. Resolves the latest SER street CSV through the datos.madrid.es CKAN API
   (dataset `218228-0-ser-calles`), preferring the newest dated file name.
2. Decodes it as ISO-8859-1 and parses rows into stretches with the Madrid parser.
3. Validates: it fails loudly on unknown colour codes, missing or out-of-bounds
   coordinates, or a row count more than 20% lower than the committed data.
4. Groups visitor (blue) stretches into candidate zones: stretches within 150 m of
   each other in the same neighbourhood form one zone, with a stable id and a
   target point on a real street.
5. Writes `stretches.json` and `candidates.json` (each with `sourceDate` and
   `generatedAt`) and prints a summary of rows added and removed per kind.

Review the summary, then commit the changed JSON files. You can also pass a local
CSV path (`npm run data:madrid -- path/to/calles-ser-YYYY-MM-DD.csv`) or set
`SER_CSV_PATH`.

## Testing on a phone (local HTTPS)

Geolocation only works in a secure context, so the dev server needs HTTPS to be
usable from a phone on your Wi-Fi. HTTPS is opt-in through `@vitejs/plugin-basic-ssl`
and does not affect normal dev, build or tests:

```sh
HTTPS=1 npm run dev -- --host
```

Open the printed `https://<your-computer-ip>:5173/` URL on the phone (same Wi-Fi) and
accept the self-signed certificate warning. Then grant the location permission.

## Deployment

Pushes to `main` that pass CI are deployed to GitHub Pages by
`.github/workflows/ci.yml` (job `deploy`). The build uses
`VITE_BASE=/blue_zones_around_me/` because Pages serves the app under that path.
One-time setup: in the repository settings, set Pages source to "GitHub Actions".

Every push and pull request runs format check, lint, type check, unit tests,
Playwright e2e and the build. The manual iPhone and Android checks are in
[docs/manual-device-checklist.md](docs/manual-device-checklist.md).

## Languages

The UI is available in English (`en`) and Spanish (`es`). The language is picked
automatically from the system/browser language (`navigator.languages`, first
supported match wins); anything else falls back to English. There is no manual
switch. Zone and street names come from the data and are never translated, and
Madrid's official zone names ("Zona azul", "Zona verde") are kept as is.

The web app manifest (name and description) and the static `<title>` in
`index.html` are build-time and stay in English; at runtime the app sets
`document.title` and `<html lang>` for the detected language.

To add a language:

1. Create `src/i18n/messages.xx.ts` exporting a `Record<MessageKey, string>`
   (TypeScript fails the build if a key is missing or extra; keep `{placeholder}`s
   identical and provide `_one`/`_other` plural pairs).
2. Add the code to `Locale`, `detectLocale` and the catalog map in `src/i18n/core.ts`.
3. Add detection and parity cases to `src/i18n/i18n.test.ts`.

## Offline behaviour

After the first load the service worker caches the app and zone data (about 8 MB),
so zones, ranking, "Around me" and the tried list work offline. Map tiles are cached
as you view them; areas you have not viewed may be blank offline. Destination search
needs a connection.

## Analytics and privacy

The app uses [GoatCounter](https://www.goatcounter.com), a privacy-friendly,
cookieless analytics service, hosted at https://bluezones.goatcounter.com (the
dashboard is there once the owner logs in). It sets no cookies and stores no
identifiers in the browser, so no consent banner is used.

**What is measured**

- Page views, country, browser/device type and referrer (collected by GoatCounter
  itself from the page-view hit; IP addresses are not stored).
- Nine anonymous event counters, each a fixed name that carries no data:

| Event            | Meaning                                        |
| ---------------- | ---------------------------------------------- |
| `around-me`      | "Around me" was pressed                        |
| `search-address` | An address was chosen from the search results  |
| `map-long-press` | A long-press on the map started a search       |
| `go-google`      | Navigation was launched with Google Maps       |
| `go-waze`        | Navigation was launched with Waze              |
| `found-yes`      | "Found a spot?" answered Yes                   |
| `found-next`     | "Found a spot?" answered No, next zone         |
| `widen`          | "Widen search" was pressed                     |
| `close-results`  | The results panel was closed with the x button |

**What is never sent to GoatCounter:** your location or coordinates, search text, street or zone
names, or any other user-derived value. This is enforced by the type system:
`track()` in `src/analytics/index.ts` only accepts the nine event names above.

**When it is off:** in development builds, on `localhost` and local-network hosts,
in tests (`?e2e`), and when the browser sends Do Not Track. Content blockers can also
block it; the app works the same without it, and offline nothing is sent.

**Removing or replacing it:** delete `src/analytics/` and the `initAnalytics()` call
in `src/main.tsx` (plus the `track(...)` calls in `src/App.tsx`), or swap the
implementation inside `src/analytics/index.ts`, keeping the `track` signature.

**Address lookup (not analytics)**

- Typing in the search box sends only the typed text (and the Madrid bounding box)
  to the public [Photon](https://photon.komoot.io) geocoder, to suggest addresses.
- After a long-press on the map, the app shows the address of the pressed point. For
  that it sends the pressed coordinates (not your GPS position, unless you pressed
  there) to the same public Photon server, with no other identifier.
- Nothing from either lookup goes to GoatCounter. If the lookup fails, times out or
  you are offline, the panel silently keeps the label "Selected point". Closing the
  results panel cancels a lookup that is still running and drops the address.

## Limitations

- Distances are straight-line, not driving distance or time.
- Zones are grouped clusters of stretches, not official SER sectors.
- No live parking availability.
- SER operating hours, fees and payment are ignored: a blue zone is treated as blue at all times.
- Madrid only; no accounts, sync, in-app navigation or saved parking location.

## Adding another city

Add a per-city config (`src/cities/<city>/config.ts`: bounds, centre, geocoder box,
zone kinds, grouping radius, search radii) and a parser in
`scripts/cities/<city>/parse.ts` that turns the city's source data into stretches,
then wire a `data:<city>` script. The core logic, adapters and UI are city-agnostic;
the UI currently loads Madrid only, so a city picker would also be needed.

## Attribution and data

- Parking zone data: Ayuntamiento de Madrid open data portal,
  [datos.madrid.es](https://datos.madrid.es) (see its terms of use).
- Parking tickets (CC BY 4.0), used for the "usual availability" estimate: Ayuntamiento de Madrid,
  [SER tiques de aparcamiento](https://datos.madrid.es/dataset/300470-0-ser-uso-parquimetros).
  Rebuild `public/data/madrid/busyness.json` with `python3 scripts/build-busyness.py` (downloads
  about 800 MB of quarterly ZIPs; needs network, no Node). Tickets undercount parked cars, so it is
  a relative, historic indication, not a live count.
- Barrio boundaries and codes: Ayuntamiento de Madrid, "Límite de Barrios de la Zona S.E.R."
  layer of its regulated-parking map service. Refresh `public/data/madrid/barrios.geojson`
  with `python3 scripts/build-barrios.py` (needs network; no Node required).
- Parking meter locations: Ayuntamiento de Madrid, "Parquímetros" layer of its regulated-parking
  map service. Refresh `public/data/madrid/parquimetros.geojson` with
  `python3 scripts/build-parquimetros.py` (needs network; no Node required).
- Map data: &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
  served as vector tiles by [OpenFreeMap](https://openfreemap.org), rendered with
  [MapLibre GL JS](https://maplibre.org).
- Destination search: [Photon](https://photon.komoot.io) geocoder (OpenStreetMap data).
