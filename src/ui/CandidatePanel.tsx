import { useState } from 'react';
import { formatNumber, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import type { RankResult } from '../core/ranking';
import type { CandidateZone, Origin } from '../core/types';
import BusynessPopup from './BusynessPopup';

interface Props {
  result: RankResult;
  mode: Origin['mode'];
  /** Address of the destination (destination searches only). */
  destinationLabel?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGo: (id: string) => void;
  /** Navigate to the destination pin itself (destination searches only). */
  onGoToPin?: () => void;
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
  destinationLabel,
  selectedId,
  onSelect,
  onGo,
  onGoToPin,
  onWiden,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const [busyZone, setBusyZone] = useState<CandidateZone | null>(null);
  const zoneName = (zone: CandidateZone): string => {
    if (zone.streets.length === 0) return zone.neighbourhood;
    const shown = zone.streets.slice(0, 2).join(', ');
    const more = zone.streets.length - 2;
    return more > 0 ? t('card.moreStreets', { shown, count: more }) : shown;
  };
  const header = (
    <div className="panel-header">
      {destinationLabel && <p className="panel-address">{destinationLabel}</p>}
      <button type="button" className="panel-close" aria-label={t('panel.close')} onClick={onClose}>
        ×
      </button>
    </div>
  );
  const pinCard = onGoToPin && (
    <div className="card card-pin" data-testid="pin-card">
      <div className="card-main card-main-static">
        <span className="card-name">{t('pin.title')}</span>
        <span className="card-sub">{t('pin.sub')}</span>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        aria-label={t('pin.goLabel')}
        onClick={onGoToPin}
      >
        {t('card.go')}
      </button>
    </div>
  );
  const cards = result.ranked.slice(0, 3);
  if (cards.length === 0) {
    return (
      <section className="panel" aria-label={t('panel.label')}>
        {header}
        {pinCard}
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
      {pinCard}
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
            <button
              type="button"
              className="btn btn-pct"
              aria-label={t('card.busyness', { name: zoneName(zone) })}
              onClick={() => setBusyZone(zone)}
            >
              %
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onGo(zone.id)}>
              {t('card.go')}
            </button>
          </li>
        ))}
      </ul>
      {busyZone && <BusynessPopup zone={busyZone} onClose={() => setBusyZone(null)} />}
    </section>
  );
}
