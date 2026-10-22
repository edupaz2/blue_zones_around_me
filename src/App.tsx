import { useAppState } from './ui/useAppState';
import { useZoneData } from './ui/useZoneData';
import type { ZoneData } from './ui/useZoneData';

function Ready({ data }: { data: ZoneData }) {
  useAppState(data);
  // Later tasks render the real UI here.
  return <main data-testid="app-ready">Blue Zones Around Me</main>;
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
