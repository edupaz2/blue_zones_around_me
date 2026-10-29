import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { CandidateZone } from '../core/types';
import { hourSlots, loadBusyness } from './busyness';
import type { BusynessTable } from './busyness';

interface Props {
  zone: CandidateZone;
  onClose: () => void;
  /** Injectable for tests; defaults to the current time. */
  now?: Date;
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; table: BusynessTable };

const barColor = (pct: number): string =>
  pct >= 60 ? '#2e7d32' : pct >= 40 ? '#f9a825' : '#c62828';
const hourLabel = (h: number): string => `${String(h).padStart(2, '0')}:00`;
const offsetLabel = (o: number, now: string): string =>
  o === 0 ? now : `${o > 0 ? '+' : '−'}${Math.abs(o)}h`;

export default function BusynessPopup({ zone, onClose, now }: Props) {
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadBusyness().then(
      (table) => !cancelled && setLoad({ status: 'ready', table }),
      () => !cancelled && setLoad({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const slots = load.status === 'ready' ? hourSlots(load.table, zone.id, now ?? new Date()) : null;
  let body: ReactNode;
  if (load.status === 'loading') body = <p className="busy-msg">{t('busy.loading')}</p>;
  else if (load.status === 'error') body = <p className="busy-msg">{t('busy.error')}</p>;
  else if (!slots) body = <p className="busy-msg">{t('busy.noData')}</p>;
  else
    body = (
      <>
        <p className="busy-sub">{t('busy.legend')}</p>
        <ul className="busy-bars">
          {slots.map((s) => (
            <li key={s.offset} className={`busy-col${s.offset === 0 ? ' busy-now' : ''}`}>
              <span className="busy-pct">{s.pct === null ? '–' : `${s.pct}%`}</span>
              <span className="busy-track">
                {s.pct === null ? (
                  <span className="busy-off" title={t('busy.free')} />
                ) : (
                  <span
                    className="busy-fill"
                    style={{ height: `${s.pct}%`, background: barColor(s.pct) }}
                  />
                )}
              </span>
              <span className="busy-hour">{hourLabel(s.hour)}</span>
              <span className="busy-offset">{offsetLabel(s.offset, t('busy.now'))}</span>
            </li>
          ))}
        </ul>
        {slots.some((s) => s.pct === null) && <p className="busy-foot">– {t('busy.free')}</p>}
        <p className="busy-foot">
          {t('busy.note', {
            from: load.status === 'ready' ? load.table.days.from : '',
            to: load.status === 'ready' ? load.table.days.to : '',
          })}
        </p>
      </>
    );

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="busy-title">
        <div className="modal-head">
          <h2 id="busy-title">{t('busy.title')}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label={t('busy.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="busy-zone">{zone.neighbourhood}</p>
        {body}
      </div>
    </div>
  );
}
