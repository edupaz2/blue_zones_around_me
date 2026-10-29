# Blue Zones Around Me — Design Spec

**Date:** 2026-10-22
**Status:** Approved and implemented (v1); amended 2026-10-23 with post-v1 changes — see section 10
**Last updated:** 2026-10-23 (describes the product as built; the changelog in section 10 lists what changed after approval)
**Repository:** git@edupaz-github.com:edupaz2/blue_zones_around_me.git

## 1. Purpose

When driving in Madrid and looking for street parking, it is hard to know where
the **blue zones** (visitor parking: cheaper, longer stays) are versus the
**green zones** (resident parking). This app shows both on a live map and,
while searching, suggests nearby blue zones and hands navigation off to Google
Maps or Waze, remembering which zones were already tried so the next suggestion
is always a new one.

**Audience:** the author first, possibly friends and other Madrid drivers
later. Built properly enough to share via a link, without store publishing.

**Success looks like:** the user sets a destination (or taps "Around me"),
picks one of the suggested blue zones, drives there via Google Maps/Waze, and if
no space is found, gets the next-best untried zone in one tap.

## 2. Scope

### In scope (v1)

- Mobile-first, installable web app (PWA) for iPhone and Android.
- Live user location on a map with blue and green SER zones.
- Destination search (primary) and one-tap "Around me".
- Top 3 candidate blue zones, ranked by distance, excluding tried zones.
- Hand-off to Google Maps or Waze.
- "Found a spot?" prompt on return; "next zone" marks the zone as tried.
- Madrid only, with a structure that allows adding cities later.
- Offline use of zone data after first load.
- UI in the system language, English or Spanish (added in PR #3).
- Anonymous, cookieless usage analytics with a closed set of events (PR #7).
- A red pin and a street address for destination searches, including the
  address of a long-pressed point (`feat/destination-pin`, pending merge).

### Out of scope (v1)

- Live parking space availability.
- In-app turn-by-turn navigation or a route looping through several zones.
- SER operating hours, fees, payment. A zone is treated as blue at all times.
- Saving where the car was parked.
- Accounts, backend, sync between devices.
- City picker / any city other than Madrid.
- Native apps, CarPlay, Android Auto.

### Future direction (informs v1 structure, not built now)

- **CarPlay** requires a native iOS app with Apple's Parking entitlement
  (`com.apple.developer.carplay-parking`), requested from and reviewed by Apple.
  A PWA cannot appear in CarPlay. v1 keeps all domain logic in framework-free
  TypeScript (`src/core/`) so a future React Native app can reuse it.
- **More cities**: handled by per-city modules (Section 5.2).

## 3. Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Platform | Web-first PWA | Shareable by link, one codebase for iPhone and Android, no store. Live location is only needed while the app is open, because navigation is handed off. |
| Language / framework | TypeScript, React, Vite | Fast, lightweight web app. React keeps a path to React Native for CarPlay later. |
| Flutter | Rejected for v1 | Flutter web draws everything on a canvas through a multi-MB WebAssembly engine: slow first load and startup on mobile data, map embedded through interop, non-web behaviour, weakest on iOS Safari. Flutter would only fit a native-first plan. |
| Map | MapLibre GL JS + OpenFreeMap tiles | Free, no API key or billing, handles thousands of clustered markers. |
| Geocoding | Photon (OpenStreetMap), limited to the city's area. **No `lang` parameter is sent**: Photon answers HTTP 400 to `lang=es` (the original plan prescribed it; this broke search in production and was fixed in PR #1). | Free, no key. |
| Reverse geocoding | Photon `/reverse` for the address of a long-pressed point; best effort, never blocks the search (section 4.7) | Same service, no key. Sends the pressed coordinates to Photon. |
| Localization | UI follows the system language: English (also the fallback) and Spanish; no manual switch; official zone names stay Spanish (section 4.6) | The audience is Madrid drivers, some of whom use English phones. No setting means nothing to maintain. |
| Analytics | GoatCounter, cookieless; page views plus nine anonymous constant events (section 9.2) | Shows whether anyone uses the app without profiling anyone. |
| Map-style resilience | The basemap style is fetched defensively; on failure a blank inline style is used | Zones, cards and hand-off keep working when the tile server is unreachable (section 7). |
| Navigation | Hand-off to Google Maps / Waze via universal links | Proven navigation and voice guidance, no routing engine to build. |
| Architecture | Fully static, client-only | Dataset is a few thousand rows; ranking runs on the phone. No server to maintain. |
| Hosting | GitHub Pages, deployed by GitHub Actions | Free, HTTPS (required for geolocation), code already on GitHub. |

## 4. User experience

### 4.1 Main screen

- Full-screen map. The user's live position is a dot, and the map follows it
  until the user pans; a **recenter** button restores following.
- **Blue and green zones are both shown by default with equal visibility.**
  Markers are clustered when zoomed out.
- **Settings** has separate show/hide toggles for blue and for green, plus the
  preferred navigation app.
- Other SER kinds (orange, high-turnover, red) are not shown.
- Top: **destination search bar** with suggestions as you type, limited to
  Madrid. The suggestions popup has a **×** button (also closing the "no
  results"/unavailable message); **Escape** closes it too. Closing keeps the
  typed text and ignores a search still in flight (PR #4).
- Bottom: large **"Around me"** button. It is **hidden while the results panel
  is displayed** and returns when the panel is closed (PR #5).
- On every new search and after "next zone", the map **fits** the origin, the
  ranked zones' targets and the tried zones' targets; follow mode is turned off
  until the user taps recenter. The recenter button sits above the bottom
  overlay (positioned from its measured height) so it is never covered.
- Blue and green markers use identical radius and opacity; blue is drawn above
  green with a white stroke halo. Colours: blue `#0d3c8a`, green `#2e7d32`,
  tried zones grey `#9e9e9e` with a thicker stroke. Clusters break up at zoom 14.

### 4.2 Choosing a zone

- After a search or "Around me", a bottom panel shows the **top 3 candidate
  blue zones**. Each card shows: street/neighbourhood name, number of blue
  spaces, and straight-line distance (to the destination in destination mode,
  from the user in "Around me" mode).
- A slim header row on the panel shows the destination address (section 4.7)
  and a **×** (48 px) that closes the panel and ends the search (PR #5).
- Tapping a card highlights the zone on the map.
- **Go** opens Google Maps or Waze. On first use the user picks one, and the
  choice is remembered and can be changed in settings. The first-use chooser
  can be **cancelled** (Cancel button, Escape, or a tap outside the dialog):
  nothing is launched, the session stays `choosing` and no app is saved
  (PR #2). Go on an expired or ignored session does not open any app.
- Candidate suggestions are **blue only**. Green is for map reading.

### 4.3 Returning after driving a zone

- When the user returns to the app while a zone is being driven, the app asks
  **"Found a spot?"**
  - **Yes** ends the search session.
  - **No, next zone** marks the zone as tried and immediately shows the next 3
    best untried zones.
- Tried zones are shown greyed on the map.

### 4.4 Session end

A search session (and its tried list) ends when the user searches a new
destination, taps "Around me" again, answers "Yes", closes the results panel
with **×** (the `cancel` action, PR #5), or after 90 minutes without use.

### 4.5 Driving safety

Large touch targets, at most 3 choices on screen, and no typing required for
"Around me" or "next zone".

### 4.6 Language (added in PR #3)

- The UI follows the system language: the first entry of `navigator.languages`
  whose primary subtag is `es` or `en` wins; anything else falls back to
  English. There is no manual language switch.
- Messages live in typed catalogs (`src/i18n/messages.en.ts`, `messages.es.ts`);
  plurals use `Intl.PluralRules`; distances and dates are formatted for the
  locale. `I18nProvider` sets `<html lang>` and the document title; components
  also work without a provider (English).
- The official zone names "Zona azul" / "Zona verde" are kept in both languages.
  The static web manifest (name, description) stays English.

### 4.7 Destination address and pin (added on `feat/destination-pin`, pending merge)

- After an in-bounds long-press the search starts **at once** with the label
  "Selected point"; the app never waits for the network.
- In parallel, Photon's `/reverse` endpoint (no `lang`, 4 s timeout) looks up
  the address. If it answers, the label in the results-panel header is replaced
  by the address (the `relabel` session action). On any failure the label stays.
  Address searches show the chosen suggestion's label; "Around me" shows none.
- A red map pin (accessible name "Destination"/"Destino", not interactive)
  marks destination-mode searches while the session is not `idle`.
- The lookup is aborted on a new search, on close and on unmount. Closing the
  panel removes the pin and the address.
- Privacy: the pressed coordinates are sent to Photon (README, "Address lookup").

## 5. Data

### 5.1 Source (Madrid)

- Dataset **"Calles y número de plazas SER"** on datos.madrid.es (CSV/XLSX,
  UTF-8, updated quarterly).
- One row per SER street stretch: district/neighbourhood, street, colour (RGB
  decimal), parking type, number of spaces, and an **approximate midpoint**
  coordinate. No street geometry, so the map shows markers, not painted streets.
- Field reference: `EstructuraCallesSER2025.pdf` on datos.madrid.es.
- The coordinate system is confirmed when the pipeline is built. If it is
  projected (e.g. ETRS89 / UTM 30N), the pipeline converts to WGS84 with
  `proj4`.

### 5.2 Zone kinds and city modules

The core never refers to colours. It uses generic zone kinds:

| Kind | Meaning | Madrid |
|---|---|---|
| `visitor` | Paid, longer stay for non-residents | Blue, "Zona azul" |
| `resident` | Residents' area | Green, "Zona verde" |
| `other` | Anything else; kept in data, unused | Orange, high-turnover, red |

Each city has:

- `src/cities/<city>/config.ts`: name, map starting centre and bounds, geocoder
  search area, label and colour per zone kind, and grouping/ranking parameters.
- `scripts/cities/<city>/parse.ts`: converts the city's source file into the
  common `Stretch` format (column names, colour codes, coordinate conversion).
- Output data in `public/data/<city>/`.

Adding a city means a new config, a new parser, running the pipeline for it, and
adding a city picker. Core, session and UI code do not change.

### 5.3 Pipeline (`scripts/build-data.ts`, run quarterly)

Command: `npm run data:madrid`.

1. Download the latest source CSV.
2. Parse rows with the city parser into `Stretch` records.
3. Validate, failing loudly on unknown colour codes, missing or out-of-bounds
   coordinates, or a row count more than 20% lower than the previously committed
   data.
4. Group `visitor` stretches into candidate zones (5.4).
5. Write `stretches.json` (all `visitor` and `resident` stretches) and
   `candidates.json`, each with `sourceDate` and `generatedAt`.
6. Print a summary of the changes (rows added/removed per kind) for review
   before committing.

### 5.4 Candidate zones

- A candidate zone is a group of `visitor` stretches where each stretch is
  within **150 m** of at least one other stretch in the group (single-linkage),
  limited to the same neighbourhood.
- Each zone stores: stable `id` (hash of city, neighbourhood and sorted stretch
  ids), total spaces, street names, centroid, and a **target point**: the
  stretch with the most spaces among those nearest the centroid. Hand-off
  navigates to the target point, so the user is sent to a real street.

### 5.5 Ranking

- **Origin:** the destination (destination mode) or the user's position
  ("Around me").
- On **next zone**, destination mode keeps the same destination as origin.
  "Around me" mode re-reads the user's current position, since the user has
  moved while driving the previous zone. If no position is available, the
  previous origin is reused.
- Candidates within **800 m** straight-line distance of the origin, excluding
  tried zones, sorted by distance and then by total spaces (descending).
- If fewer than 3 are found, the radius widens in steps (800 m → 1.2 km → 1.6 km
  → 2 km).
- If none remain, the app says so and offers to widen the radius further. Each
  widening adds 1 km to the radius list; the widening is reset on a new search
  and when the results panel is closed.
- All distances are straight-line (haversine). Google Maps or Waze handle the
  actual route.

## 6. Architecture

One Vite project, three layers.

```
blue_zones_around_me/
  src/
    core/            # plain TypeScript: no React, no browser APIs
      types.ts       # Stretch, CandidateZone, CityConfig, Origin, SessionState/Action, Settings
      geo.ts         # haversine distance
      bounds.ts      # inBounds(point, bounds)
      ranking.ts     # rankCandidates(origin, candidates, triedIds, options)
      session.ts     # search session state machine
      handoff.ts     # buildNavigationUrl('google' | 'waze', point)
    adapters/        # browser-specific; replaced in a future native app
      location.ts      # navigator.geolocation.watchPosition
      geocoder.ts      # Photon search and reverse lookup, limited to the city area
      storage.ts       # versioned localStorage for session + settings
      appVisibility.ts # visibilitychange / pageshow -> return detection
    analytics/
      index.ts       # GoatCounter loader and typed track()
    i18n/            # core.ts (detect, format), I18nProvider.tsx, messages.en.ts, messages.es.ts
    cities/
      madrid/config.ts
    ui/              # React components and hooks
      MapView.tsx, mapLayers.ts, mapFit.ts, mapStyle.ts, longPress.ts
      SearchBar.tsx, AroundMeButton.tsx, CandidatePanel.tsx
      FoundSpotPrompt.tsx, NavAppChooser.tsx, openNavigation.ts
      SettingsSheet.tsx, StaleDataBanner.tsx
      useAppState.ts, useZoneData.ts, ui.css
    App.tsx, main.tsx, setupTests.ts
  scripts/
    build-data.ts, pipeline.ts, group.ts, validate.ts
    cities/madrid/parse.ts
  e2e/               # Playwright specs
  public/data/madrid/
    stretches.json
    candidates.json
  public/icons/
  .github/workflows/ci.yml
  docs/
```

### 6.1 Session state machine (`core/session.ts`)

```
idle      --start (search / around me)-->  choosing
choosing  --go(zoneId)------------------>  driving(zoneId)
choosing  --cancel (results panel x)---->  idle      (origin and tried cleared)
choosing  --relabel(point, label)------->  choosing  (label replaced; no activity update)
driving   --found-------------------->  idle
driving   --next--------------------->  choosing   (zoneId added to tried)
any       --start while active------->  choosing   (tried cleared)
any       --tick / any action after 90 min idle-->  idle (tried cleared)
```

| Action | Applies when | Effect |
|---|---|---|
| `start` | any | New origin, `choosing`, tried cleared |
| `go` | `choosing` | `driving` with the chosen zone; ignored otherwise |
| `found` | `driving` | back to `idle` |
| `next` | `driving` | `choosing`, current zone appended to tried; optional fresh origin |
| `cancel` | `choosing` | back to `idle`; ignored when `idle` or `driving` (PR #5) |
| `relabel` | `choosing`, destination mode, same point as the open search | only the origin label changes; `lastActivityAt` is untouched, so late or stale answers are harmless (`feat/destination-pin`) |
| `tick` | any | only applies expiry |

The session is a pure reducer. Time is passed in, not read from the clock, so
expiry can be tested. **Expiry is checked first** for every action: more than 90
minutes since `lastActivityAt` resets to `idle` before the action is applied
(exactly 90 minutes does not expire). `useAppState` ticks every 60 s, on app
return and once on load, so a stale restored session is dropped immediately.

### 6.2 Surviving reloads

iOS often reloads a PWA after the user switches to Google Maps or Waze. The
session (state, current zone, tried list, origin, last activity time) is saved
to `localStorage` and restored on load. On load or when the page becomes
visible, if the restored state is `driving`, the "Found a spot?" prompt is
shown; a restored `choosing` session shows the candidate panel again. The state
changes to `driving` **before** the navigation link opens, and the save is
**synchronous**: `useAppState` runs the reducer on a mirror of the state, saves,
and only then dispatches, because a post-render effect might not run before iOS
suspends the page. `dispatch` returns the resulting session, which lets `Go`
detect an expired or ignored session and not open the navigation app.

### 6.3 Hand-off URLs

- Google Maps: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
- Waze: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`

Both are universal links. If the app is not installed, the web version opens.
`src/ui/openNavigation.ts` calls `window.open(url, '_blank', 'noopener')` so the
PWA document (and its `driving` state) stays alive; with `noopener` the call
always returns `null`, so success cannot be detected. Whether this hands off to
the app from an installed iOS PWA is unverified on a real device (section 11).

## 7. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Location permission denied or unavailable | Map, toggles and search work. "Around me" is disabled with a short note on enabling location (iOS Safari and Android Chrome instructions). |
| Location accuracy worse than ~100 m | Accuracy circle shown. "Around me" still works. |
| User outside the city's bounds | "Around me" shows "You're outside the Madrid SER area". |
| Geocoder down, offline or no results | Message, plus fallback: **long-press on the map sets the destination**. |
| Long-press outside the city's bounds | Short note; no search starts. |
| Reverse lookup (address) fails, times out or finds nothing | The label stays "Selected point"; nothing else changes. A late answer after a new search or close is ignored. |
| Go on an expired or non-`choosing` session | The reducer ignores `go`; no navigation app is opened and nothing is counted. |
| Analytics blocked, offline, Do Not Track on, or not loaded | `track` is a silent no-op; the app is unaffected. |
| No signal | Service worker caches app and zone data. Zones, ranking, "Around me" and tried list work offline. Unvisited map tiles may be blank. |
| Tile server down, style unreachable or offline on first paint | `resolveStyle` fetches the style with a 6 s timeout; on any failure it falls back to a minimal inline background style. Zone markers and cards still work, with no labels or street names. |
| Stored session/settings corrupt or old schema version | Discarded silently, app starts at `idle`. |
| Cluster tapped on the map | Zooms in and turns follow mode off. |
| Zone data fails to load | Full-screen message with Retry. |
| Zone data older than 6 months | Settings shows the data date. A small banner suggests refreshing. |
| Source data format changed | Pipeline fails at build time (5.3). Bad data never reaches the app. |

## 8. Testing

Test-first throughout. No exact test counts are recorded here; CI is the source
of truth.

- **Core (Vitest), the bulk of the tests:** ranking (order, tie-breaks, tried
  exclusion, radius widening, all-tried case), session (every transition
  including `cancel` and `relabel`, 90-minute expiry, reset on new search), geo
  (known distances), bounds, handoff (URL formats).
- **Pipeline (Vitest, fixture CSV of real Madrid rows):** colour → kind mapping,
  coordinate conversion checked against a known landmark, 150 m grouping, target
  point choice, each validation failure, the data-file builder and diff summary.
- **Adapters:** storage with corrupt and old-version data; geocoder search and
  reverse lookup with mocked `fetch` (no `lang`, timeout, abort, failures);
  location and app-return.
- **UI (React Testing Library):** candidate cards and Go, "Found a spot?" →
  next zone, chooser cancel, blue/green toggles, settings, stale banner, search
  suggestions close, results panel close, address and pin, language selection
  (`App.i18n.test.tsx`), long-press, map fit bounds, map-style fallback.
- **i18n and analytics (Vitest):** locale detection, plurals, missing keys;
  analytics enablement rules (production, host, `?e2e`, Do Not Track) and that
  only the nine constant events can be sent.
- **End-to-end (Playwright, software WebGL, map style stubbed, faked
  geolocation):** `tried-zone` (Around me → Go → reload → prompt → next zone →
  tried zone excluded and greyed; markers really render; markers and cards work
  when the style cannot load), `spanish` (UI follows the system language),
  `search-close`, `results-close`, `destination-pin` (address and red pin,
  stale answer ignored, long address clamped, Spanish layout), `analytics` (no
  script or request on localhost).
- **Manual device checklist (iPhone and Android):** `docs/manual-device-checklist.md`.

## 9. Tooling and delivery

### 9.1 Tooling and CI

- TypeScript (strict), Vite, React, MapLibre GL JS, `vite-plugin-pwa`, `proj4`,
  Vitest, React Testing Library, Playwright, ESLint, Prettier, npm. Node 24 is
  pinned in `.nvmrc`; `engines.node` is `>=22.12`.
- **Local phone testing:** Vite dev server over local HTTPS (`HTTPS=1`, basic-ssl
  plugin) on the Wi-Fi network, so geolocation works on the phone.
- **CI (GitHub Actions, `.github/workflows/ci.yml`)**, job `check` on every push
  and pull request: `npm ci`, format check, lint, type check, unit and UI tests,
  Playwright e2e (its own web server builds a base-`/` bundle), then the Pages
  build with `VITE_BASE=/blue_zones_around_me/`. On push to `main` the artifact
  is uploaded.
- **Deploy:** job `deploy` runs on push to `main` only (Pages source: GitHub
  Actions). A **deploy guard** (PR #6) compares the run's commit with the tip of
  `main` through the GitHub API and skips the deployment with a warning when it
  is older, so re-running an old workflow run cannot overwrite a newer deploy.
  The job needs `contents: read` for that check.
- Actions are pinned at `checkout@v4`, `setup-node@v4`, `upload-artifact@v4`,
  `upload-pages-artifact@v3`, `deploy-pages@v4` (newer majors exist; section 11).
- **PWA:** `registerType: 'autoUpdate'`; Workbox precaches the app shell and the
  data files, with the size limit raised to 10 MiB because `stretches.json` is
  about 5.9 MB; OpenFreeMap style, tiles, sprites and glyphs use
  stale-while-revalidate. MapLibre's worker is bundled with `?worker&url` and
  `setWorkerUrl`, because Vite does not otherwise emit it (without it production
  showed no markers).
- Commits are SSH-signed.
- **Data refresh:** manual `npm run data:madrid`, review the summary, commit.

### 9.2 Analytics (PR #7)

- GoatCounter at `https://bluezones.goatcounter.com`, cookieless, loaded from
  `src/analytics/index.ts`. Visitors come from the standard page-view hit.
- Usage comes from nine constant events typed as a closed union: `around-me`,
  `search-address`, `map-long-press`, `go-google`, `go-waze`, `found-yes`,
  `found-next`, `widen`, `close-results`. `track` accepts nothing else, so
  coordinates, search text and zone names cannot be sent.
- Disabled in development, on localhost and private-network hosts, in tests
  (`?e2e`), and when Do Not Track is on.

## 10. Changelog since approval

| Date | PR / branch | Change |
|---|---|---|
| 2026-10-22 | initial commits | Design spec and implementation plan written. |
| 2026-10-22/23 | #1 `worktree-hidden-splashing-nautilus` | Initial implementation (plan Tasks 1–18); map polish (Task 17b: fit to results, measured recenter position, overlay scroll, equal-visibility layers, tried grey, `clusterMaxZoom` 14); final-review fixes: no Photon `lang` (HTTP 400), defensive map style with fallback, bundled MapLibre worker, cluster tap turns follow off, Go on an expired session does not navigate, manifest description, e2e asserts markers render. |
| 2026-10-23 | #2 `feat/nav-chooser-cancel` | The first-use navigation-app chooser can be cancelled. |
| 2026-10-23 | #3 `feat/i18n` | English and Spanish UI following the system language. |
| 2026-10-23 | #4 `feat/search-suggestions-close` | × and Escape close the suggestions popup. |
| 2026-10-23 | #5 `feat/results-panel-close` | × on the results panel; `cancel` action; radii reset; Around me hidden while results show. |
| 2026-10-23 | #6 `ci/deploy-guard` | Pages deploy skipped unless the run is the tip of `main`. |
| 2026-10-23 | #7 `feat/analytics` | Cookieless GoatCounter, nine anonymous events. |
| 2026-10-23 | `feat/destination-pin` (pending merge) | Reverse-geocoded address after long-press, `relabel` action, red destination pin. |

## 11. Known limitations and follow-ups

- **iOS standalone hand-off unverified:** `window.open(url, '_blank', 'noopener')`
  to Google Maps/Waze has not been tried on a real device. Fallback:
  `location.assign` in `src/ui/openNavigation.ts` (`noopener` makes
  `window.open` always return `null`, so failure cannot be detected in code).
- **Zone chaining:** single-linkage grouping lets some zones grow long; 22 of
  275 zones have a stretch more than 500 m from the target (largest about 1.5 km
  across). Consider a maximum diameter.
- **Data size:** `stretches.json` is about 5.9 MB (mostly resident stretches);
  the first load precaches about 8 MB.
- **Around me** stays disabled after a transient GPS error until the next fix.
- Tapping a card or changing tried zones rebuilds all ~34k map features.
- Follow mode stays off after answering "Yes".
- No Content-Security-Policy. Tile requests reveal the viewed area to OpenFreeMap.
- Workflow action versions are behind the current majors.
- The static manifest is not localized; dates are ISO in English and long-form
  in Spanish.
- The Madrid parser does not handle quoted CSV fields; a format change would
  still fail loudly.
