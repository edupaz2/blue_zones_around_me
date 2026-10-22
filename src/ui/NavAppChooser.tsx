import { useEffect, useRef } from 'react';

interface Props {
  onChoose: (app: 'google' | 'waze') => void;
}

export default function NavAppChooser({ onChoose }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  return (
    <div className="modal-backdrop">
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
        <p className="note">You can change this later in settings.</p>
      </div>
    </div>
  );
}
