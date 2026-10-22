import { useState } from 'react';
import { madridConfig } from './cities/madrid/config';
import { inBounds } from './core/bounds';
import { buildNavigationUrl } from './core/handoff';
import type { LatLng } from './core/types';
import AroundMeButton from './ui/AroundMeButton';
import CandidatePanel from './ui/CandidatePanel';
import FoundSpotPrompt from './ui/FoundSpotPrompt';
import MapView from './ui/MapView';
import NavAppChooser from './ui/NavAppChooser';
import { openNavigation } from './ui/openNavigation';
import SearchBar from './ui/SearchBar';
import SettingsSheet from './ui/SettingsSheet';
import StaleDataBanner from './ui/StaleDataBanner';
import { useAppState } from './ui/useAppState';
import { useZoneData } from './ui/useZoneData';
import type { ZoneData } from './ui/useZoneData';
import './ui/ui.css';

function Ready({ data }: { data: ZoneData }) {
  const { session, settings, position, locationStatus, ranked, dispatch, setSettings, widen } =
    useAppState(data);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [pendingGoId, setPendingGoId] = useState<string | null>(null);
  // Derived: a selection only counts while that zone is still in the list.
  const selectedId = ranked.ranked.some((r) => r.zone.id === pickedId) ? pickedId : null;
  const [pointError, setPointError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const startDestination = (point: LatLng, label: string) => {
    setPointError(false);
    setSelectedId(null);
    dispatch({ type: 'start', origin: { mode: 'destination', point, label }, now: Date.now() });
  };

  const onLongPress = (p: LatLng) => {
    if (!inBounds(p, madridConfig.bounds)) {
      setPointError(true);
      return;
    }
    startDestination(p, 'Selected point');
  };

  const launch = (zoneId: string, app: 'google' | 'waze') => {
    const zone = data.candidates.find((z) => z.id === zoneId);
    if (!zone) return;
    // Persist the driving state first: iOS may reload the PWA once the nav app opens.
    dispatch({ type: 'go', zoneId, now: Date.now() });
    openNavigation(buildNavigationUrl(app, zone.target));
  };

  const onGo = (zoneId: string) => {
    if (settings.navApp === null) setPendingGoId(zoneId);
    else launch(zoneId, settings.navApp);
  };

  const onChooseApp = (app: 'google' | 'waze') => {
    const zoneId = pendingGoId;
    setPendingGoId(null);
    setSettings({ ...settings, navApp: app });
    if (zoneId !== null) launch(zoneId, app);
  };

  const onNext = () => {
    const origin =
      session.origin?.mode === 'around' && position
        ? { mode: 'around' as const, point: position.point }
        : undefined;
    dispatch({ type: 'next', now: Date.now(), origin });
  };

  return (
    <main data-testid="app-ready" style={{ position: 'fixed', inset: 0 }}>
      <MapView
        data={data}
        settings={settings}
        position={position}
        tried={session.tried}
        highlightedZoneId={selectedId}
        onLongPress={onLongPress}
        recenterSignal={0}
      />
      <div className="overlay-top">
        <div className="top-row">
          <SearchBar onSelect={(r) => startDestination(r.point, r.label)} />
          <button
            type="button"
            className="settings-btn"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
        <StaleDataBanner sourceDate={data.sourceDate} now={Date.now()} />
        {pointError && (
          <p className="note" role="alert">
            That point is outside the Madrid SER area
          </p>
        )}
      </div>
      <div className="overlay-bottom">
        {session.status === 'choosing' && session.origin && (
          <CandidatePanel
            result={ranked}
            mode={session.origin.mode}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGo={onGo}
            onWiden={widen}
          />
        )}
        <AroundMeButton
          position={position}
          locationStatus={locationStatus}
          onPress={(origin) => {
            setPointError(false);
            setSelectedId(null);
            dispatch({ type: 'start', origin, now: Date.now() });
          }}
        />
      </div>
      {session.status === 'driving' && (
        <FoundSpotPrompt
          onFound={() => dispatch({ type: 'found', now: Date.now() })}
          onNext={onNext}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          sourceDate={data.sourceDate}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingGoId !== null && <NavAppChooser onChoose={onChooseApp} />}
    </main>
  );
}

export default function App() {
  const { status, data, retry } = useZoneData();
  if (status === 'loading') return <div role="status">Loading zones…</div>;
  if (status === 'error' || !data) {
    return (
      <div role="alert">
        <p>Couldn&apos;t load zone data</p>
        <button onClick={retry}>Retry</button>
      </div>
    );
  }
  return <Ready data={data} />;
}
