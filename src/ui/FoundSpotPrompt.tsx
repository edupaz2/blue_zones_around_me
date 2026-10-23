import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

interface Props {
  onFound: () => void;
  onNext: () => void;
}

export default function FoundSpotPrompt({ onFound, onNext }: Props) {
  const { t } = useI18n();
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => yesRef.current?.focus(), []);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="found-spot-title">
        <h2 id="found-spot-title">{t('found.title')}</h2>
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
