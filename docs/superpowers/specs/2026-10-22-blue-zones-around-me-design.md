# Blue Zones Around Me — Design Spec

**Date:** 2026-10-22
**Status:** Draft — awaiting review
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
| Geocoding | Photon (OpenStreetMap), limited to the city's area | Free, no key. |
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
  Madrid.
- Bottom: large **"Around me"** button.

### 4.2 Choosing a zone

- After a search or "Around me", a bottom panel shows the **top 3 candidate
  blue zones**. Each card shows: street/neighbourhood name, number of blue
  spaces, and straight-line distance (to the destination in destination mode,
  from the user in "Around me" mode).
- Tapping a card highlights the zone on the map.
- **Go** opens Google Maps or Waze. On first use the user picks one, and the
  choice is remembered and can be changed in settings.
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
destination, taps "Around me" again, answers "Yes", or after 90 minutes without
use.

### 4.5 Driving safety

Large touch targets, at most 3 choices on screen, and no typing required for
"Around me" or "next zone".

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
- If none remain, the app says so and offers to widen the radius further.
- All distances are straight-line (haversine). Google Maps or Waze handle the
  actual route.

## 6. Architecture

One Vite project, three layers.

```
blue_zones_around_me/
  src/
    core/          # plain TypeScript: no React, no browser APIs
      types.ts     # Stretch, CandidateZone, Session, Settings, ZoneKind
      geo.ts       # haversine distance
      ranking.ts   # rankCandidates(origin, candidates, triedIds, options)
      session.ts   # search session state machine
      handoff.ts   # buildNavigationUrl('google' | 'waze', point)
    adapters/      # browser-specific; replaced in a future native app
      location.ts      # navigator.geolocation.watchPosition
      geocoder.ts      # Photon, limited to city area
      storage.ts       # versioned localStorage for session + settings
      appVisibility.ts # visibilitychange / fresh load → return detection
    cities/
      madrid/config.ts
    ui/            # React components
      MapView.tsx
      SearchBar.tsx
      AroundMeButton.tsx
      CandidatePanel.tsx
      FoundSpotPrompt.tsx
      SettingsSheet.tsx
  scripts/
    build-data.ts
    cities/madrid/parse.ts
  public/data/madrid/
    stretches.json
    candidates.json
  docs/superpowers/specs/
```

### 6.1 Session state machine (`core/session.ts`)

```
idle      --search / around me-->  choosing
choosing  --go(zoneId)--------->  driving(zoneId)
driving   --found it----------->  idle
driving   --next zone---------->  choosing   (zoneId added to tried)
any       --new search / 90 min idle-->  idle (tried cleared)
```

The session is a pure reducer. Time is passed in, not read from the clock, so
expiry can be tested.

### 6.2 Surviving reloads

iOS often reloads a PWA after the user switches to Google Maps or Waze. The
session (state, current zone, tried list, origin, last activity time) is saved
to `localStorage` on every change and restored on load. On load or when the page
becomes visible, if the restored state is `driving`, the "Found a spot?" prompt
is shown. The state changes to `driving` **before** the navigation link opens.

### 6.3 Hand-off URLs

- Google Maps: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
- Waze: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`

Both are universal links. If the app is not installed, the web version opens.

## 7. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Location permission denied or unavailable | Map, toggles and search work. "Around me" is disabled with a short note on enabling location (iOS Safari and Android Chrome instructions). |
| Location accuracy worse than ~100 m | Accuracy circle shown. "Around me" still works. |
| User outside the city's bounds | "Around me" shows "You're outside the Madrid SER area". |
| Geocoder down, offline or no results | Message, plus fallback: **long-press on the map sets the destination**. |
| No signal | Service worker caches app and zone data. Zones, ranking, "Around me" and tried list work offline. Unvisited map tiles may be blank. |
| Tile server down | Blank background. Zone markers and candidate cards still work. |
| Stored session/settings corrupt or old schema version | Discarded silently, app starts at `idle`. |
| Zone data fails to load | Full-screen message with Retry. |
| Zone data older than 6 months | Settings shows the data date. A small banner suggests refreshing. |
| Source data format changed | Pipeline fails at build time (5.3). Bad data never reaches the app. |

## 8. Testing

Test-first throughout.

- **Core (Vitest), the bulk of the tests:** ranking (order, tie-breaks, tried
  exclusion, radius widening, all-tried case), session (every transition,
  90-minute expiry, reset on new search), geo (known distances), handoff (URL
  formats).
- **Pipeline (Vitest, fixture CSV of real Madrid rows):** colour → kind mapping,
  coordinate conversion checked against a known landmark, 150 m grouping, target
  point choice, each validation failure.
- **Adapters:** storage with corrupt and old-version data; geocoder with mocked
  `fetch`.
- **UI (React Testing Library):** candidate cards and Go, "Found a spot?" →
  next zone, blue/green toggles.
- **End-to-end (Playwright, faked geolocation):** Around me → Go → page reload →
  prompt appears → next zone → tried zone excluded from list and greyed on map.
- **Manual device checklist (iPhone and Android):** install to home screen,
  location permission, hand-off to Google Maps and Waze, return prompt, offline
  behaviour.

## 9. Tooling and delivery

- TypeScript (strict), Vite, React, MapLibre GL JS, `vite-plugin-pwa`, `proj4`
  (if needed), Vitest, React Testing Library, Playwright, ESLint, Prettier, npm,
  current Node LTS.
- **Local phone testing:** Vite dev server over local HTTPS on the Wi-Fi
  network, so geolocation works on the phone.
- **CI (GitHub Actions):** on every push: lint, type check, unit and UI tests,
  build. On push to `main`: also deploy to GitHub Pages.
- **Data refresh:** manual `npm run data:madrid`, review the summary, commit.
