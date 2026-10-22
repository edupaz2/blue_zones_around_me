import { useState } from 'react';
import { madridConfig } from './cities/madrid/config';
import { inBounds } from './core/bounds';
import type { LatLng } from './core/types';
import AroundMeButton from './ui/AroundMeButton';
import CandidatePanel from './ui/CandidatePanel';
import MapView from './ui/MapView';
import SearchBar from './ui/SearchBar';
import { useAppState } from './ui/useAppState';
import { useZoneData } from './ui/useZoneData';
import type { ZoneData } from './ui/useZoneData';
import './ui/ui.css';

function Ready({ data }: { data: ZoneData }) {
  const { session, settings, position, locationStatus, ranked, dispatch, widen } =
    useAppState(data);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pointError, setPointError] = useState(false);

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
        <SearchBar onSelect={(r) => startDestination(r.point, r.label)} />
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
            // TODO(Task 14): implement Go / navigation hand-off.
            onGo={() => {}}
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
