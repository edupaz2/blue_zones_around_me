import MapView from './ui/MapView';
import { useAppState } from './ui/useAppState';
import { useZoneData } from './ui/useZoneData';
import type { ZoneData } from './ui/useZoneData';

function Ready({ data }: { data: ZoneData }) {
  const { session, settings, position } = useAppState(data);
  // Later tasks render the rest of the UI here.
  return (
    <main data-testid="app-ready" style={{ position: 'fixed', inset: 0 }}>
      <MapView
        data={data}
        settings={settings}
        position={position}
        tried={session.tried}
        highlightedZoneId={null}
        onLongPress={() => {}}
        recenterSignal={0}
      />
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
