import type { RankResult } from '../core/ranking';
import type { CandidateZone, Origin } from '../core/types';

interface Props {
  result: RankResult;
  mode: Origin['mode'];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGo: (id: string) => void;
  onWiden: () => void;
}

export function formatDistance(m: number): string {
  const r = Math.round(m);
  return r < 1000 ? `${r} m` : `${(m / 1000).toFixed(1)} km`;
}

function zoneName(zone: CandidateZone): string {
  if (zone.streets.length === 0) return zone.neighbourhood;
  const shown = zone.streets.slice(0, 2).join(', ');
  const more = zone.streets.length - 2;
  return more > 0 ? `${shown} +${more} more` : shown;
}

export default function CandidatePanel({
  result,
  mode,
  selectedId,
  onSelect,
  onGo,
  onWiden,
}: Props) {
  const cards = result.ranked.slice(0, 3);
  if (cards.length === 0) {
    return (
      <section className="panel" aria-label="Blue zones">
        <p className="panel-empty">No more blue zones nearby</p>
        <button type="button" className="btn btn-primary" onClick={onWiden}>
          Widen search
        </button>
      </section>
    );
  }
  return (
    <section className="panel" aria-label="Blue zones">
      <ul className="cards">
        {cards.map(({ zone, distanceM }) => (
          <li key={zone.id} className={`card${zone.id === selectedId ? ' card-selected' : ''}`}>
            <button
              type="button"
              className="card-main"
              aria-label={`Show ${zoneName(zone)} on map`}
              aria-pressed={zone.id === selectedId}
              onClick={() => onSelect(zone.id)}
            >
              <span className="card-name">{zoneName(zone)}</span>
              <span className="card-sub">{zone.neighbourhood}</span>
              <span className="card-meta">
                {zone.totalSpaces} blue spaces · <span>{formatDistance(distanceM)}</span>{' '}
                {mode === 'around' ? 'from you' : 'from destination'}
              </span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onGo(zone.id)}>
              Go
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
