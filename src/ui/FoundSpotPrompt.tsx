import { useEffect, useRef } from 'react';

interface Props {
  onFound: () => void;
  onNext: () => void;
}

export default function FoundSpotPrompt({ onFound, onNext }: Props) {
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => yesRef.current?.focus(), []);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="found-spot-title">
        <h2 id="found-spot-title">Found a spot?</h2>
        <button ref={yesRef} type="button" className="btn btn-primary" onClick={onFound}>
          Yes
        </button>
        <button type="button" className="btn" onClick={onNext}>
          No, next zone
        </button>
      </div>
    </div>
  );
}
