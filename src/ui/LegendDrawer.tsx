import { useEffect, useRef } from 'react';
import { madridConfig } from '../cities/madrid/config';
import { useI18n } from '../i18n';
import { METERS_COLOR } from './mapColors';

interface Props {
  onClose: () => void;
}

const { visitor, resident } = madridConfig.kinds;

export default function LegendDrawer({ onClose }: Props) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = [
    { key: 'visitor', color: visitor.color, text: t('legend.visitor'), meter: false },
    { key: 'resident', color: resident.color, text: t('legend.resident'), meter: false },
    { key: 'meter', color: METERS_COLOR, text: t('legend.meter'), meter: true },
  ];
  return (
    <div
      className="drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="legend-title">
        <div className="modal-head">
          <h2 id="legend-title">{t('legend.title')}</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            aria-label={t('legend.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <ul className="legend-list">
          {items.map((i) => (
            <li key={i.key} className="legend-row" data-testid={`legend-${i.key}`}>
              <span
                className={`legend-dot${i.meter ? ' legend-dot-meter' : ''}`}
                style={{ background: i.color }}
                aria-hidden="true"
              />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
        <p className="legend-note">{t('legend.clusters')}</p>
      </aside>
    </div>
  );
}
