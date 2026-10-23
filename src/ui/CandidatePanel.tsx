import { formatNumber, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import type { RankResult } from '../core/ranking';
import type { CandidateZone, Origin } from '../core/types';

interface Props {
  result: RankResult;
  mode: Origin['mode'];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGo: (id: string) => void;
  onWiden: () => void;
  onClose: () => void;
}

export function formatDistance(m: number, locale: Locale = 'en'): string {
  const r = Math.round(m);
  if (r < 1000) return `${r} m`;
  const km = formatNumber(locale, m / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${km} km`;
}

export default function CandidatePanel({
  result,
  mode,
  selectedId,
  onSelect,
  onGo,
  onWiden,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const zoneName = (zone: CandidateZone): string => {
    if (zone.streets.length === 0) return zone.neighbourhood;
    const shown = zone.streets.slice(0, 2).join(', ');
    const more = zone.streets.length - 2;
    return more > 0 ? t('card.moreStreets', { shown, count: more }) : shown;
  };
  const header = (
    <div className="panel-header">
      <button type="button" className="panel-close" aria-label={t('panel.close')} onClick={onClose}>
        ×
      </button>
    </div>
  );
  const cards = result.ranked.slice(0, 3);
  if (cards.length === 0) {
    return (
      <section className="panel" aria-label={t('panel.label')}>
        {header}
        <p className="panel-empty">{t('panel.noMore')}</p>
        <button type="button" className="btn btn-primary" onClick={onWiden}>
          {t('panel.widen')}
        </button>
      </section>
    );
  }
  return (
    <section className="panel" aria-label={t('panel.label')}>
      {header}
      <ul className="cards">
        {cards.map(({ zone, distanceM }) => (
          <li
            key={zone.id}
            data-zone-id={zone.id}
            className={`card${zone.id === selectedId ? ' card-selected' : ''}`}
          >
            <button
              type="button"
              className="card-main"
              aria-label={t('card.show', { name: zoneName(zone) })}
              aria-pressed={zone.id === selectedId}
              onClick={() => onSelect(zone.id)}
            >
              <span className="card-name">{zoneName(zone)}</span>
              <span className="card-sub">{zone.neighbourhood}</span>
              <span className="card-meta">
                {t('card.spaces', { count: zone.totalSpaces })} ·{' '}
                <span>{formatDistance(distanceM, locale)}</span>{' '}
                {mode === 'around' ? t('card.fromYou') : t('card.fromDestination')}
              </span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onGo(zone.id)}>
              {t('card.go')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
