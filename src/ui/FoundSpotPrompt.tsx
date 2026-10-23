import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

interface Props {
  onFound: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function FoundSpotPrompt({ onFound, onNext, onClose }: Props) {
  const { t } = useI18n();
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => yesRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="found-spot-title">
        <div className="modal-head">
          <h2 id="found-spot-title">{t('found.title')}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label={t('found.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <button ref={yesRef} type="button" className="btn btn-primary" onClick={onFound}>
          {t('found.yes')}
        </button>
        <button type="button" className="btn" onClick={onNext}>
          {t('found.next')}
        </button>
      </div>
    </div>
  );
}
