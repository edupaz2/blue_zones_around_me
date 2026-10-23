# Blue Zones Around Me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, installable PWA that shows Madrid blue/green SER zones on a live map, suggests the top 3 nearby blue zones, hands navigation to Google Maps/Waze, and remembers tried zones.

**Architecture:** Fully static client-only Vite app. Framework-free domain logic in `src/core/` (pure, tested first), browser-specific `src/adapters/`, React `src/ui/`. A build-time data pipeline (`scripts/`) converts the Madrid SER CSV into `public/data/madrid/{stretches,candidates}.json`.

**Tech Stack:** TypeScript (strict), Vite, React, MapLibre GL JS + OpenFreeMap, Photon geocoder, `vite-plugin-pwa`, `proj4` (if needed), Vitest, React Testing Library, Playwright, ESLint, Prettier, npm, Node LTS, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-22-blue-zones-around-me-design.md`

**Implementation status (2026-10-23):** Tasks 1–18 are implemented and were merged in PR #1 (`worktree-hidden-splashing-nautilus`), together with the unplanned Task 17b (map polish) and a final-review fix wave. The Addendum at the end of this file records the post-plan tasks: 19–24 were implemented in PRs #2–#7, and Task 25 is on `feat/destination-pin` (pending merge). Tasks 1–18 below are kept unchanged as the historical record; where the text is known to be wrong, see the corrections.

**Corrections to the plan text** (what the code actually does):

- Task 10: `lang=es` is **wrong**. Photon answers HTTP 400 to it, which broke search in production. No `lang` parameter is sent (search or reverse).
- Task 12: MapLibre's web worker is not emitted by the Vite build on its own (no markers in production). It is imported with `?worker&url` and registered with `setWorkerUrl` in `src/ui/MapView.tsx`. The map style is also fetched defensively (`src/ui/mapStyle.ts`) with an inline fallback.
- Task 6: `CityConfig` lives in `src/core/types.ts` (config.ts only exports `madridConfig`), and `scripts/types.ts` was never created. Real data findings (see the header of `scripts/cities/madrid/parse.ts`): the CSV is ISO-8859-1/windows-1252 (not UTF-8; `decodeMadridCsv` tries UTF-8 first), `;`-delimited, with coordinates in ETRS89 / UTM 30N (EPSG:25830) converted with `proj4`.
- Task 8: the pipeline logic is split into `scripts/pipeline.ts` (`buildDataFiles`, `diffByKind`, tested in `pipeline.test.ts`); `build-data.ts` only does I/O.
- Task 11: `useAppState` also returns `radiiM` and `widen`, and its `dispatch` returns the resulting `SessionState` (so Go can detect an ignored action). Expiry is also applied once on mount and on app return, not only every 60 s.
- Task 14: `NavAppChooser` takes `onCancel` as well as `onChoose` (Task 19); `openNavigation` lives in `src/ui/openNavigation.ts`.
- Task 5: the `SessionAction` union also has `cancel` and `relabel` (Tasks 22 and 25).

## Global Constraints

- TypeScript `strict`; `src/core/` imports no React and no browser APIs; time is passed in, never read from the clock inside core.
- Core never mentions colours: only zone kinds `visitor` | `resident` | `other`.
- Candidate suggestions are `visitor` only; resident (green) is map-only. Blue and green both shown by default with equal visibility; separate toggles in settings.
- Candidate grouping: single-linkage within **150 m**, same neighbourhood. Zone `id` = hash of city, neighbourhood and sorted stretch ids. `target` = stretch with most spaces among those nearest the centroid.
- Ranking: radius steps **800 m → 1.2 km → 1.6 km → 2 km**; show top **3**; sort by distance, then total spaces descending; straight-line haversine.
- Session expires after **90 minutes** idle; state set to `driving` **before** the navigation link opens; session + settings persisted in versioned `localStorage`, corrupt/old-version data discarded silently.
- Hand-off URLs: Google `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; Waze `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`.
- Pipeline fails loudly on unknown colour codes, missing/out-of-bounds coordinates, or row count >20% lower than the committed data. Output files carry `sourceDate` and `generatedAt`.
- Zone data older than 6 months → settings shows the date and a small banner suggests refreshing.
- Geocoder (Photon) limited to the city area. Long-press on map sets destination as fallback.
- Out of scope: live availability, in-app navigation, SER hours/fees, accounts/backend, other cities, native apps.
- Per-city structure: `src/cities/<city>/config.ts`, `scripts/cities/<city>/parse.ts`, `public/data/<city>/`.
- CI on every push: lint, type check, unit + UI tests, build; deploy to GitHub Pages on push to `main`. Test-first throughout.

## Review Focus

1. **CSV encoding/format surprises** (non-UTF-8 bytes, accented street names, decimal commas, blank rows, duplicate rows): parser must not corrupt names or crash; duplicates collapsed. (Task 6)
2. **Stretches with 0 or missing spaces**: must not produce zones with 0 spaces or NaN totals. (Tasks 6, 7)
3. **All candidates tried / none within 2 km**: ranking returns empty with a signal; UI says so and offers wider radius rather than showing a blank panel. (Tasks 4, 13)
4. **Reload while `choosing` (not just `driving`)**: restored state must show the candidate panel again, not a blank map. (Tasks 9, 14)
5. **Destination far outside Madrid, or "Around me" outside bounds**: clear message, no ranking against distant zones. (Tasks 10, 13)

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `src/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `data:madrid` (the last two wired in later tasks).

- [ ] **Step 1: Write failing smoke test** `src/smoke.test.ts`: `expect(1 + 1).toBe(2)` under Vitest (jsdom environment configured in `vite.config.ts`).
- [ ] **Step 2: Run** `npx vitest run` — Expected: FAIL (vitest not installed/configured).
- [ ] **Step 3: Scaffold** Vite React-TS project in the repo root (keep `docs/`), add strict TS, Vitest + jsdom + React Testing Library, ESLint, Prettier, `.gitignore` (node_modules, dist, playwright reports). `App.tsx` renders a placeholder `<div>Blue Zones Around Me</div>`.
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test && npm run build` — Expected: all PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "chore: scaffold Vite React TS project"`

### Task 2: Core types and geo

**Files:**
- Create: `src/core/types.ts`, `src/core/geo.ts`, `src/core/geo.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type ZoneKind = 'visitor' | 'resident' | 'other';
  export interface LatLng { lat: number; lng: number }
  export interface Stretch { id: string; city: string; neighbourhood: string; street: string; kind: ZoneKind; spaces: number; lat: number; lng: number }
  export interface CandidateZone { id: string; city: string; neighbourhood: string; stretchIds: string[]; streets: string[]; totalSpaces: number; centroid: LatLng; target: LatLng }
  export interface Settings { showVisitor: boolean; showResident: boolean; navApp: 'google' | 'waze' | null }
  ```
  (`Session` types are added in Task 5.)
- Produces (`geo.ts`): `haversineM(a: LatLng, b: LatLng): number` (metres).

- [ ] **Step 1: Write failing tests** in `geo.test.ts`: Puerta del Sol (40.4169, -3.7035) to Plaza de Cibeles (40.4193, -3.6932) ≈ 900 m (±30 m); same point → 0; symmetric.
- [ ] **Step 2: Run** `npx vitest run src/core/geo.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `types.ts` as above and `haversineM` in `geo.ts`.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): add types and haversine distance`

### Task 3: Navigation hand-off URLs

**Files:**
- Create: `src/core/handoff.ts`, `src/core/handoff.test.ts`

**Interfaces:**
- Consumes: `LatLng`.
- Produces: `buildNavigationUrl(app: 'google' | 'waze', point: LatLng): string`.

- [ ] **Step 1: Write failing tests**: for `{lat: 40.4168, lng: -3.7038}`, google → `https://www.google.com/maps/dir/?api=1&destination=40.4168,-3.7038`; waze → `https://waze.com/ul?ll=40.4168,-3.7038&navigate=yes`.
- [ ] **Step 2: Run** `npx vitest run src/core/handoff.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `buildNavigationUrl`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): navigation hand-off URLs`

### Task 4: Ranking

**Files:**
- Create: `src/core/ranking.ts`, `src/core/ranking.test.ts`

**Interfaces:**
- Consumes: `haversineM`, `CandidateZone`, `LatLng`.
- Produces:
  ```ts
  export interface RankOptions { radiiM: number[]; maxResults: number }   // defaults used by callers: [800,1200,1600,2000], 3
  export interface Ranked { zone: CandidateZone; distanceM: number }
  export interface RankResult { ranked: Ranked[]; radiusM: number | null }  // radiusM = radius that produced results; null if none
  export function rankCandidates(origin: LatLng, candidates: CandidateZone[], triedIds: readonly string[], options: RankOptions): RankResult
  ```

- [ ] **Step 1: Write failing tests** (fixture zones at known offsets from origin): sorted by distance; equal distance → higher `totalSpaces` first; tried ids excluded; zones beyond 800 m excluded when ≥3 found within 800 m; radius widens (1.2 km, 1.6 km, 2 km) when fewer than 3 found and `radiusM` reports the radius used; returns at most `maxResults`; nothing within 2 km → `{ranked: [], radiusM: null}`; **all candidates tried → `{ranked: [], radiusM: null}`** (Review Focus 3).
- [ ] **Step 2: Run** `npx vitest run src/core/ranking.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `rankCandidates`: for each radius in order, filter untried zones within it, stop at the first radius yielding ≥ `maxResults`, otherwise keep the last radius that yielded any (the widest tried); sort and slice.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): candidate ranking with radius widening`

### Task 5: Session state machine

**Files:**
- Create: `src/core/session.ts`, `src/core/session.test.ts`
- Modify: `src/core/types.ts` (add session types)

**Interfaces:**
- Consumes: `LatLng`.
- Produces:
  ```ts
  export interface Origin { mode: 'destination' | 'around'; point: LatLng; label?: string }
  export interface SessionState { status: 'idle' | 'choosing' | 'driving'; origin: Origin | null; zoneId: string | null; tried: string[]; lastActivityAt: number }
  export type SessionAction =
    | { type: 'start'; origin: Origin; now: number }
    | { type: 'go'; zoneId: string; now: number }
    | { type: 'found'; now: number }
    | { type: 'next'; now: number; origin?: Origin }   // origin supplied in 'around' mode (fresh position)
    | { type: 'tick'; now: number }
  export const SESSION_TIMEOUT_MS = 90 * 60 * 1000;
  export const initialSession: SessionState;
  export function sessionReducer(state: SessionState, action: SessionAction): SessionState
  ```

- [ ] **Step 1: Write failing tests**: idle→`start`→choosing (tried empty); choosing→`go`→driving(zoneId); driving→`found`→idle; driving→`next`→choosing with zoneId appended to `tried`; `next` with `origin` replaces origin, without keeps it; `start` while choosing/driving clears `tried`; `go` when idle is ignored; any action with `now - lastActivityAt > 90 min` first resets to idle (tried cleared), exactly 90 min does not expire; `tick` past expiry → idle, `tick` before → unchanged; every non-expiring action updates `lastActivityAt`.
- [ ] **Step 2: Run** `npx vitest run src/core/session.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the pure reducer (apply expiry check first, then the transition).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): session state machine`

### Task 6: Madrid config and CSV parser

**Files:**
- Create: `src/cities/madrid/config.ts`, `scripts/cities/madrid/parse.ts`, `scripts/cities/madrid/parse.test.ts`, `scripts/cities/madrid/fixtures/ser-sample.csv`
- Create: `scripts/types.ts` (city module contract)

**Interfaces:**
- Consumes: `Stretch`, `ZoneKind`.
- Produces:
  ```ts
  // src/cities/madrid/config.ts
  export interface CityConfig { id: string; name: string; center: LatLng; bounds: [west: number, south: number, east: number, north: number]; geocoderBbox: [number, number, number, number]; kinds: Record<ZoneKind, { label: string; color: string }>; groupingRadiusM: number; radiiM: number[]; maxResults: number }
  export const madridConfig: CityConfig
  // scripts/cities/madrid/parse.ts
  export function parseMadridCsv(csvText: string): Stretch[]   // throws on unknown colour code; drops duplicate rows; ignores 'other' only by tagging kind 'other'
  ```

- [ ] **Step 1: Inspect the real dataset.** Download "Calles y número de plazas SER" CSV from datos.madrid.es into the scratchpad; record actual column names, encoding, delimiter, decimal format, colour-code values for blue/green/others, and the coordinate system (WGS84 vs ETRS89/UTM 30N). Copy ~30 real rows (incl. accented names, a duplicate, a 0-space row) into `fixtures/ser-sample.csv`. Record findings as comments atop `parse.ts`.
- [ ] **Step 2: Write failing tests** against the fixture: blue colour → `visitor`, green → `resident`, others → `other`; coordinates match a known landmark within 50 m (convert with `proj4` if projected); accented names preserved (e.g. "Alcalá"); duplicate rows collapsed; rows with 0/missing spaces get `spaces: 0` (never NaN); unknown colour code throws with the code in the message; stable `id` per stretch (deterministic from source fields).
- [ ] **Step 3: Run** `npx vitest run scripts/cities/madrid/parse.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement** `parseMadridCsv` (handle the encoding discovered in Step 1) and `madridConfig` (centre Puerta del Sol; bounds/geocoder bbox from the min/max of the dataset plus margin; labels "Zona azul"/"Zona verde"; grouping 150, radii [800,1200,1600,2000], maxResults 3).
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit** `feat(data): Madrid config and SER CSV parser`

### Task 7: Candidate zone grouping

**Files:**
- Create: `scripts/group.ts`, `scripts/group.test.ts`

**Interfaces:**
- Consumes: `Stretch`, `haversineM`, `CandidateZone`.
- Produces: `groupVisitorStretches(stretches: Stretch[], city: string, groupingRadiusM: number): CandidateZone[]`

- [ ] **Step 1: Write failing tests**: two visitor stretches 100 m apart in same neighbourhood → one zone; chain A–B 100 m, B–C 100 m, A–C 200 m → one zone (single-linkage); 200 m apart → two zones; same distance but different neighbourhood → two zones; resident/other stretches ignored; `totalSpaces` is the sum; `target` is the stretch with most spaces among those nearest the centroid and equals a real stretch's coordinates; `id` is stable regardless of input order; **zones with `totalSpaces` 0 are dropped** (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run scripts/group.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with union-find per neighbourhood; `id` = short hash (e.g. SHA-1 hex first 12 chars) of `city|neighbourhood|sortedStretchIds`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): group visitor stretches into candidate zones`

### Task 8: Validation and build-data script

**Files:**
- Create: `scripts/validate.ts`, `scripts/validate.test.ts`, `scripts/build-data.ts`
- Create (generated, committed): `public/data/madrid/stretches.json`, `public/data/madrid/candidates.json`
- Modify: `package.json` (add `data:madrid`)

**Interfaces:**
- Consumes: `parseMadridCsv`, `groupVisitorStretches`, `madridConfig`.
- Produces: `validateStretches(stretches: Stretch[], bounds: CityConfig['bounds'], previousCount: number | null): void` (throws); data files shaped `{ sourceDate: string; generatedAt: string; items: Stretch[] }` and `{ sourceDate; generatedAt; items: CandidateZone[] }`.

- [ ] **Step 1: Write failing tests** for `validateStretches`: passes on good data; throws on out-of-bounds coordinate; on NaN/missing coordinate; on count >20% below `previousCount`; passes at exactly 20% lower; `previousCount: null` skips the count check.
- [ ] **Step 2: Run** `npx vitest run scripts/validate.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `validateStretches`, then `build-data.ts`: download CSV (URL from Task 6 Step 1), parse, validate against previously committed `stretches.json` count, group, write both JSON files keeping only `visitor`+`resident` stretches, print per-kind added/removed summary. Add `"data:madrid": "tsx scripts/build-data.ts"` (install `tsx`).
- [ ] **Step 4: Run** `npx vitest run scripts/validate.test.ts && npm run data:madrid` — Expected: tests PASS; script prints summary and writes both files; spot-check that `candidates.json` has plausible count (hundreds to low thousands) and Puerta del Sol area has a zone.
- [ ] **Step 5: Commit** `feat(data): build pipeline and Madrid dataset`

### Task 9: Storage adapter

**Files:**
- Create: `src/adapters/storage.ts`, `src/adapters/storage.test.ts`

**Interfaces:**
- Consumes: `SessionState`, `initialSession`, `Settings`.
- Produces: `loadSession(): SessionState`, `saveSession(s: SessionState): void`, `loadSettings(): Settings`, `saveSettings(s: Settings): void`. Storage keys carry a schema version (`bza:v1:session`, `bza:v1:settings`). Defaults: `{showVisitor: true, showResident: true, navApp: null}`.

- [ ] **Step 1: Write failing tests**: save→load round-trips; empty storage → `initialSession` / default settings; corrupt JSON → defaults, no throw; wrong version → defaults; wrong shape (e.g. `status: 'bogus'`) → defaults; `localStorage` throwing (private mode) → defaults, no throw; a persisted `choosing` session round-trips intact (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run src/adapters/storage.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with a shape guard function per type.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(adapters): versioned storage`

### Task 10: Geocoder and location adapters

**Files:**
- Create: `src/adapters/geocoder.ts`, `src/adapters/geocoder.test.ts`, `src/adapters/location.ts`, `src/adapters/location.test.ts`, `src/adapters/appVisibility.ts`, `src/adapters/appVisibility.test.ts`, `src/core/bounds.ts`, `src/core/bounds.test.ts`

**Interfaces:**
- Consumes: `CityConfig`, `LatLng`.
- Produces:
  ```ts
  // core/bounds.ts
  export function inBounds(p: LatLng, bounds: CityConfig['bounds']): boolean
  // geocoder.ts
  export interface GeoResult { label: string; point: LatLng }
  export function searchPlaces(query: string, city: CityConfig, fetchFn?: typeof fetch): Promise<GeoResult[]>  // rejects on network/HTTP error; [] on no results; drops results outside city bounds
  // location.ts
  export interface Position { point: LatLng; accuracyM: number }
  export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable'
  export function watchLocation(onPosition: (p: Position) => void, onStatus: (s: LocationStatus) => void): () => void  // returns stop fn
  // appVisibility.ts
  export function onAppReturn(cb: () => void): () => void  // fires on visibilitychange→visible and on pageshow
  ```

- [ ] **Step 1: Write failing tests**: `inBounds` inside/outside/edge; `searchPlaces` builds a Photon URL with bbox + `lang` and maps features to `GeoResult` (mock `fetch`), returns `[]` on empty features, rejects on non-OK, **filters out a result in Barcelona** (Review Focus 5); `watchLocation` forwards positions, maps `PERMISSION_DENIED` to `denied` and other errors to `unavailable`, stop fn calls `clearWatch`; `onAppReturn` fires on `visibilitychange` when visible, not when hidden, and unsubscribes.
- [ ] **Step 2: Run** `npx vitest run src/adapters src/core/bounds.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the four modules (Photon endpoint `https://photon.komoot.io/api/`, params `q`, `limit=5`, `bbox`, `lang=es`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(adapters): geocoder, location, app-return, bounds`

### Task 11: App state and data loading

**Files:**
- Create: `src/ui/useZoneData.ts`, `src/ui/useAppState.ts`, `src/ui/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `sessionReducer`, `loadSession/saveSession/loadSettings/saveSettings`, `rankCandidates`, `madridConfig`, `watchLocation`, `onAppReturn`.
- Produces:
  ```ts
  export interface ZoneData { stretches: Stretch[]; candidates: CandidateZone[]; sourceDate: string; generatedAt: string }
  export function useZoneData(): { status: 'loading' | 'error' | 'ready'; data?: ZoneData; retry: () => void }
  export function useAppState(data: ZoneData): { session: SessionState; settings: Settings; position: Position | null; locationStatus: LocationStatus; ranked: RankResult; dispatch: (a: SessionAction) => void; setSettings: (s: Settings) => void }
  ```
  `useAppState` persists session/settings on every change, ticks the session every 60 s, and computes `ranked` from `session.origin` + `session.tried`.

- [ ] **Step 1: Write failing tests** (RTL, mocked fetch): loading state, then ready state renders; fetch failure shows "Retry" and Retry refetches; restored persisted `choosing` session yields a non-empty `ranked`.
- [ ] **Step 2: Run** `npx vitest run src/ui/App.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** hooks and wire `App.tsx` to render a loading/error/ready shell.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): zone data loading and app state`

### Task 12: Map view with zones

**Files:**
- Create: `src/ui/MapView.tsx`, `src/ui/mapLayers.ts`, `src/ui/mapLayers.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ZoneData`, `Settings`, `Position`, `madridConfig`.
- Produces:
  ```ts
  // mapLayers.ts (pure, testable)
  export function stretchesToGeoJson(stretches: Stretch[], settings: Settings, triedZoneStretchIds: Set<string>, highlightedStretchIds: Set<string>): GeoJSON.FeatureCollection  // properties: kind, tried, highlighted
  // MapView.tsx
  export interface MapViewProps { data: ZoneData; settings: Settings; position: Position | null; tried: string[]; highlightedZoneId: string | null; onLongPress: (p: LatLng) => void; recenterSignal: number }
  ```
  Map: MapLibre + the OpenFreeMap "liberty" style, clustered GeoJSON source, blue and green circles with equal radius/opacity, tried zones greyed, user dot + accuracy circle, follow-user until pan, recenter button, long-press (≈600 ms) → `onLongPress`.

- [ ] **Step 1: Write failing tests** for `stretchesToGeoJson`: `showResident:false` omits resident features; `showVisitor:false` omits visitor; `other` never included; tried stretches get `tried: true`; blue and green features get no differing size/opacity properties (equal visibility).
- [ ] **Step 2: Run** `npx vitest run src/ui/mapLayers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `stretchesToGeoJson` and `MapView` (MapLibre is not unit-tested; verify manually in Step 4).
- [ ] **Step 4: Run** unit tests — Expected: PASS. Then `npm run dev`, confirm in a browser: blue/green markers cluster, un-cluster on zoom, map renders.
- [ ] **Step 5: Commit** `feat(ui): map with blue and green zones`

### Task 13: Search, Around me, candidate panel

**Files:**
- Create: `src/ui/SearchBar.tsx`, `src/ui/AroundMeButton.tsx`, `src/ui/CandidatePanel.tsx`, `src/ui/CandidatePanel.test.tsx`, `src/ui/SearchBar.test.tsx`, `src/ui/AroundMeButton.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `searchPlaces`, `Ranked`, `RankResult`, `Origin`, `inBounds`, `madridConfig`.
- Produces:
  ```ts
  SearchBar({ onSelect: (r: GeoResult) => void; search?: typeof searchPlaces })           // debounced; shows error text + "long-press the map to set a destination" hint on failure/no results
  AroundMeButton({ position: Position | null; locationStatus: LocationStatus; onPress: (origin: Origin) => void })  // disabled + enable-location note when denied/unavailable; "You're outside the Madrid SER area" when out of bounds
  CandidatePanel({ result: RankResult; mode: Origin['mode']; selectedId: string | null; onSelect: (id: string) => void; onGo: (id: string) => void; onWiden: () => void })
  ```
  Cards show streets/neighbourhood, `totalSpaces`, and distance (m or km). Empty result: message "No more blue zones nearby" with a "Widen search" button (calls `onWiden`; App then ranks with `radiiM` extended by +1 km). Max 3 cards.

- [ ] **Step 1: Write failing tests**: CandidatePanel renders 3 cards with name, spaces, "350 m"/"1.2 km" formatted distance; tapping a card calls `onSelect`; Go calls `onGo(id)`; empty result shows the none-left message and Widen calls `onWiden`; SearchBar shows suggestions from a stub search, selecting calls `onSelect`, a rejecting search shows the long-press hint; AroundMeButton disabled with note when `denied`; outside-bounds position shows the outside-area message and does not call `onPress`; inside bounds calls `onPress` with `{mode:'around', point}`.
- [ ] **Step 2: Run** `npx vitest run src/ui` — Expected: FAIL.
- [ ] **Step 3: Implement** the three components and wire in `App.tsx`: SearchBar select → `dispatch({type:'start', origin:{mode:'destination',…}})`; long-press → same with label "Selected point"; panel selection highlights zone on the map. Use large touch targets (≥48 px).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): search, around me and candidate panel`

### Task 14: Go, "Found a spot?" and reload survival

**Files:**
- Create: `src/ui/FoundSpotPrompt.tsx`, `src/ui/FoundSpotPrompt.test.tsx`
- Modify: `src/App.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `buildNavigationUrl`, `sessionReducer` actions, `onAppReturn`, `Settings.navApp`.
- Produces: `FoundSpotPrompt({ onFound: () => void; onNext: () => void })`; `NavAppChooser({ onChoose: (app: 'google'|'waze') => void })` (shown on first Go when `navApp` is null; choice saved).

- [ ] **Step 1: Write failing tests**: prompt shows "Found a spot?" with Yes / "No, next zone"; Yes → `found` dispatched; No → `next` dispatched, and in `around` mode passes a fresh `origin` from the current position (falls back to none if no position); Go with `navApp: null` shows the chooser, then dispatches `go` **before** `window.open`/location assignment (assert call order with spies) and saves the choice; with a saved app skips the chooser; a restored `driving` session shows the prompt on load; restored `choosing` session shows the candidate panel (Review Focus 4); `onAppReturn` while `driving` shows the prompt.
- [ ] **Step 2: Run** `npx vitest run src/ui` — Expected: FAIL.
- [ ] **Step 3: Implement** and wire; the zone's `target` is the hand-off point. After `next`, tried zones render greyed (via Task 12 props) and the panel shows the next 3.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): hand-off, found-a-spot prompt, reload survival`

### Task 15: Settings sheet and stale-data banner

**Files:**
- Create: `src/ui/SettingsSheet.tsx`, `src/ui/SettingsSheet.test.tsx`, `src/ui/StaleDataBanner.tsx`, `src/ui/StaleDataBanner.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `SettingsSheet({ settings: Settings; sourceDate: string; onChange: (s: Settings) => void; onClose: () => void })`; `StaleDataBanner({ sourceDate: string; now: number })` renders only if `sourceDate` is >6 months before `now`.

- [ ] **Step 1: Write failing tests**: toggles flip `showVisitor`/`showResident` independently via `onChange`; nav app radio changes `navApp`; data date displayed; banner hidden for 5-month-old data, shown for 7-month-old data.
- [ ] **Step 2: Run** `npx vitest run src/ui/SettingsSheet.test.tsx src/ui/StaleDataBanner.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** both and add a settings button to the main screen.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): settings sheet and stale-data banner`

### Task 16: PWA and offline

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: `public/icons/` (192, 512, maskable PNGs), manifest via `vite-plugin-pwa`

**Interfaces:**
- Produces: installable manifest (name "Blue Zones Around Me", `display: standalone`, theme colour), Workbox precache of app shell + `public/data/madrid/*.json`, runtime cache (stale-while-revalidate) for OpenFreeMap tiles/style.

- [ ] **Step 1: Configure** `vite-plugin-pwa` (`registerType: 'autoUpdate'`), icons, and runtime caching as above. Set Vite `base` from an env var so GitHub Pages sub-path works (`/blue_zones_around_me/`).
- [ ] **Step 2: Run** `npm run build && npx vite preview` — Expected: build output contains `manifest.webmanifest` and `sw.js`; precache list includes both JSON data files (check `dist/sw.js`).
- [ ] **Step 3: Verify offline** in browser devtools: load once, go offline, reload — app loads, zones show, "Around me" ranks.
- [ ] **Step 4: Commit** `feat: PWA manifest, service worker, offline caching`

### Task 17: End-to-end test

**Files:**
- Create: `playwright.config.ts`, `e2e/tried-zone.spec.ts`
- Modify: `package.json` (`test:e2e`)

**Interfaces:**
- Consumes: the full app via `vite preview`.

- [ ] **Step 1: Write the failing e2e test**: context with geolocation set to Puerta del Sol (permission granted); open app; tap "Around me"; 3 cards appear; note first card's title; tap Go (choose Google Maps; intercept the outgoing navigation so the test stays in the app); reload the page; "Found a spot?" appears; tap "No, next zone"; the first card's title is absent from the new list of 3; the zone is greyed on the map (assert via the app's exposed tried-state attribute, e.g. `data-tried-count="1"` on the map container).
- [ ] **Step 2: Run** `npm run test:e2e` — Expected: FAIL until the hooks (`data-testid`s, `data-tried-count`) exist.
- [ ] **Step 3: Add** the missing `data-testid`s / attributes to the UI; make the test pass.
- [ ] **Step 4: Run** `npm run test:e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `test: e2e tried-zone flow`

### Task 18: CI, deployment, and manual checklist

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/manual-device-checklist.md`, `README.md`

**Interfaces:**
- Produces: workflow with job `check` (every push: `npm ci`, lint, typecheck, test, build, Playwright) and job `deploy` (push to `main` only, needs `check`, uploads `dist` via `actions/upload-pages-artifact` and `actions/deploy-pages`, `permissions: pages: write, id-token: write`).

- [ ] **Step 1: Write** the workflow, `README.md` (dev, local HTTPS phone testing via `vite --host` with a local cert plugin such as `@vitejs/plugin-basic-ssl`, data refresh via `npm run data:madrid`), and `docs/manual-device-checklist.md` (iPhone + Android: install to home screen, location permission, Google Maps and Waze hand-off, return prompt, offline behaviour).
- [ ] **Step 2: Run locally** `npm run lint && npm run typecheck && npm test && npm run build` — Expected: all PASS.
- [ ] **Step 3: Commit and push** `ci: add CI and Pages deployment`; enable GitHub Pages (source: GitHub Actions) in repo settings; confirm the Actions run is green and the deployed URL loads.
- [ ] **Step 4: Run through** `docs/manual-device-checklist.md` on a real iPhone and Android device; record any failures as issues.

---

## Addendum: work after the original plan

Tasks below were done after Tasks 1–18, in the same style. They record what was built and why; the code and its tests are the detail. Dates are 2026-10-22/23.

### Task 17b: Map polish and final-review fix wave (in PR #1)

**Files:**
- Create: `src/ui/mapFit.ts` (+ test), `src/ui/mapStyle.ts` (+ test), `src/ui/longPress.ts` (+ test), `src/ui/openNavigation.ts`, `src/ui/NavAppChooser.tsx`, `scripts/pipeline.ts` (+ test)
- Modify: `src/ui/MapView.tsx`, `src/App.tsx`, `src/ui/ui.css`, `src/adapters/geocoder.ts`, `src/ui/useAppState.ts` (`dispatch` result), `vite.config.ts`, `e2e/tried-zone.spec.ts`

**Interfaces:**
- `boundsForPoints(points: LatLng[]): [[number, number], [number, number]] | null`; `MapViewProps.fitTo?: { id: string; points: LatLng[] } | null`.
- `resolveStyle(url, fetchFn?, timeoutMs = 6000): Promise<{ style: string | object; fallback: boolean }>`; `FALLBACK_STYLE` (blank background).
- `useAppState().dispatch(action): SessionState` (returns the state after the reducer).

- [x] Fit the map to origin + ranked targets (+ tried targets) on every new search and after "next zone"; follow mode off until Recenter.
- [x] Recenter button placed from the measured bottom overlay height (`--overlay-bottom-h`, `ResizeObserver`); overlay `max-height: 50vh` with scroll.
- [x] Blue drawn above green with a white halo, identical per-kind radius and opacity; tried zones grey `#9e9e9e` with a thicker stroke; `clusterMaxZoom` 14; colours `#1565c0` / `#2e7d32`.
- [x] Fixes: no Photon `lang` (HTTP 400); defensive style with fallback; MapLibre worker bundled with `?worker&url` + `setWorkerUrl`; cluster tap turns follow off; Go on an expired/ignored session does not open the nav app; manifest description corrected.
- [x] Key tests: `mapFit.test.ts` (bounds of points, empty); `mapStyle.test.ts` (ok, HTTP error, timeout, invalid JSON fall back); `geocoder.test.ts` (URL has bbox, no `lang`); `App.test.tsx` (Go on an expired session does not navigate); e2e asserts markers render and that cards still work when the style cannot load.

Why: the first real run showed search failing (HTTP 400), no markers in production, and an unusable map framing.

### Task 19: Navigation-app chooser can be cancelled (PR #2, `feat/nav-chooser-cancel`)

**Files:**
- Modify: `src/ui/NavAppChooser.tsx`, `src/App.tsx`, `src/ui/App.test.tsx`, `src/ui/FoundSpotPrompt.test.tsx`

**Interfaces:**
- `NavAppChooser({ onChoose: (app: 'google' | 'waze') => void; onCancel: () => void })`.

- [x] Cancel button, Escape and a tap outside the dialog all call `onCancel`, which clears the pending Go.
- [x] Key tests: after cancelling, `window.open` is not called, the session is still `choosing`, and `navApp` is still unset.

Why: a mistaken Go previously forced choosing an app.

### Task 20: Localization (PR #3, `feat/i18n`)

**Files:**
- Create: `src/i18n/{core.ts,I18nProvider.tsx,index.ts,messages.en.ts,messages.es.ts,i18n.test.ts}`, `src/ui/App.i18n.test.tsx`, `e2e/{helpers.ts,spanish.spec.ts}`
- Modify: every UI component, `src/App.tsx`, `src/main.tsx`, `playwright.config.ts`, `e2e/tried-zone.spec.ts`, `README.md`

**Interfaces:**
- `type Locale = 'en' | 'es'`; `detectLocale(languages: readonly string[] | undefined): Locale` (first supported primary subtag, else `en`); `formatMessage(locale, key, params?)` (plural keys `_one`/`_other` via `Intl.PluralRules`; missing key falls back to English, then the key); `formatNumber`, `formatDate`.
- `I18nProvider` (sets `<html lang>` and the title); `useI18n(): { locale, t, formatNumber, formatDate }`, usable without a provider.

- [x] English (also the fallback) and Spanish; distances and dates formatted for the locale; "Zona azul"/"Zona verde" kept; static manifest stays English; no manual switch.
- [x] Key tests: `i18n.test.ts` (detection, plurals, fallbacks, ISO date in English vs long date in Spanish); `App.i18n.test.tsx`; e2e `spanish.spec.ts` (UI follows a Spanish browser locale).

Why: the audience includes English-language phones; following the system language needs no settings.

### Task 21: Search suggestions popup close (PR #4, `feat/search-suggestions-close`)

**Files:**
- Modify: `src/ui/SearchBar.tsx`, `src/ui/SearchBar.test.tsx`, `src/ui/ui.css`, both message catalogs
- Create: `e2e/search-close.spec.ts`

**Interfaces:**
- No new exports; `SearchBar({ onSelect, search? })` unchanged.

- [x] A × button closes the dropdown (also the "no results"/unavailable message); Escape closes it without clearing the text; closing keeps the typed text and ignores a search still in flight.
- [x] Key tests: `SearchBar.test.tsx` (× and Escape close, text kept, late results ignored); e2e `search-close.spec.ts`.

Why: the popup covered the map with no way to dismiss it.

### Task 22: Results panel close, Around me hidden, `cancel` (PR #5, `feat/results-panel-close`)

**Files:**
- Modify: `src/core/types.ts`, `src/core/session.ts`, `src/ui/useAppState.ts`, `src/ui/CandidatePanel.tsx`, `src/App.tsx`, `src/ui/ui.css`, catalogs, `session.test.ts`, `CandidatePanel.test.tsx`, `App.test.tsx`, `App.i18n.test.tsx`
- Create: `e2e/results-close.spec.ts`

**Interfaces:**
- `SessionAction` gains `{ type: 'cancel'; now: number }`: `choosing` → `idle` (origin, tried and zone cleared); ignored when `idle` or `driving`.
- `CandidatePanel` gains `onClose: () => void` and an optional `destinationLabel`.

- [x] A slim header row with a 48 px × ends the search; the widened radii are reset on `cancel` as well as on `start`.
- [x] The Around me button is not rendered while the panel is displayed.
- [x] Key tests: `session.test.ts` (cancel from choosing; ignored when idle/driving; expiry first); `App.test.tsx` (× closes, Around me hidden then back); e2e `results-close.spec.ts` (close, then a new search works; Spanish layout).

Why: there was no way to leave a result list without starting something else.

### Task 23: Deploy guard (PR #6, `ci/deploy-guard`)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `deploy` job permissions gain `contents: read`; a `guard` step compares `github.sha` with `gh api repos/<repo>/commits/main` and sets `current=true|false`; the deployment step runs only when `current == 'true'`.

- [x] An older commit logs a warning and skips the deployment.

Why: re-running an old workflow run once overwrote a newer deployment.

### Task 24: Analytics (PR #7, `feat/analytics`)

**Files:**
- Create: `src/analytics/index.ts`, `src/analytics/analytics.test.ts`, `e2e/analytics.spec.ts`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/ui/App.test.tsx`, `README.md`

**Interfaces:**
- `type AnalyticsEvent = 'around-me' | 'search-address' | 'map-long-press' | 'go-google' | 'go-waze' | 'found-yes' | 'found-next' | 'widen' | 'close-results'`.
- `track(event: AnalyticsEvent): void`; `initAnalytics(options?: EnableInput): void`; `shouldEnableAnalytics(input: EnableInput): boolean` with `EnableInput { prod; hostname; search; doNotTrack }`.

- [x] GoatCounter (`https://bluezones.goatcounter.com`), cookieless; visitors from the page-view hit, usage from the nine constant events; nothing user-derived can be passed.
- [x] Disabled in development, on localhost and private-network hosts, with `?e2e`, and with Do Not Track; every failure is swallowed.
- [x] Key tests: `analytics.test.ts` (enablement rules, one script only, DNT, no-op when not loaded); `App.test.tsx` (events fire on the matching actions; Go on an expired session counts nothing); e2e `analytics.spec.ts` (no script or request on localhost).

Why: know whether the app is used, without collecting anything about the users.

### Task 25: Destination address and red pin (`feat/destination-pin`, pending merge)

**Files:**
- Modify: `src/adapters/geocoder.ts` (+ test), `src/core/types.ts`, `src/core/session.ts` (+ test), `src/App.tsx`, `src/ui/CandidatePanel.tsx` (+ test), `src/ui/MapView.tsx`, `src/ui/ui.css`, catalogs, `i18n.test.ts`, `App.test.tsx`, `App.i18n.test.tsx`, `README.md`
- Create: `e2e/destination-pin.spec.ts`

**Interfaces:**
- `reversePlace(point: LatLng, fetchFn?: typeof fetch, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<string | null>` (Photon `/reverse`, no `lang`, 4 s default timeout; null on any failure, never throws).
- `SessionAction` gains `{ type: 'relabel'; point: LatLng; label: string; now: number }`: applies only in `choosing` to a destination origin with the same point; does not change `lastActivityAt`.
- `MapViewProps.destinationPin?: LatLng | null` (red marker, `role="img"`, name "Destination"/"Destino", `pointer-events: none`).

- [x] After an in-bounds long-press the search starts at once with "Selected point"; the reverse answer replaces the label in the panel header (also shows an address search's label; none for Around me).
- [x] The lookup is aborted on a new search, on close and on unmount; the pin shows for destination searches while `status !== 'idle'`; closing removes pin and address.
- [x] Key tests: `geocoder.test.ts` (URL has no `lang`; timeout, abort, HTTP error, empty, bad JSON give null); `session.test.ts` (relabel only for the matching open search; no activity update); `App.test.tsx`; e2e `destination-pin.spec.ts` (address and pin appear; a late answer after close is ignored; long address clamped; Spanish name).

Why: users could not confirm what a long-pressed point was; privacy note (coordinates go to Photon) is in the README "Address lookup".
