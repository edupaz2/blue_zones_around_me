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

## Offline behaviour

After the first load the service worker caches the app and zone data (about 8 MB),
so zones, ranking, "Around me" and the tried list work offline. Map tiles are cached
as you view them; areas you have not viewed may be blank offline. Destination search
needs a connection.

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
- Map data: &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
  served as vector tiles by [OpenFreeMap](https://openfreemap.org), rendered with
  [MapLibre GL JS](https://maplibre.org).
- Destination search: [Photon](https://photon.komoot.io) geocoder (OpenStreetMap data).
