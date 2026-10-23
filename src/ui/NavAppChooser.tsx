import { useEffect, useRef } from 'react';

interface Props {
  onChoose: (app: 'google' | 'waze') => void;
  onCancel: () => void;
}

export default function NavAppChooser({ onChoose, onCancel }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        // Only a tap on the dimmed area itself dismisses; taps inside the dialog bubble up here.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nav-app-title">
        <h2 id="nav-app-title">Navigate with</h2>
        <button
          ref={firstRef}
          type="button"
          className="btn btn-primary"
          onClick={() => onChoose('google')}
        >
          Google Maps
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onChoose('waze')}>
          Waze
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <p className="note">You can change this later in settings.</p>
      </div>
    </div>
  );
}
