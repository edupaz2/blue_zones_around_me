import { useState } from 'react';
import type { LocationStatus, Position } from '../adapters/location';
import { madridConfig } from '../cities/madrid/config';
import { inBounds } from '../core/bounds';
import type { Origin } from '../core/types';

interface Props {
  position: Position | null;
  locationStatus: LocationStatus;
  onPress: (origin: Origin) => void;
}

export default function AroundMeButton({ position, locationStatus, onPress }: Props) {
  const [outside, setOutside] = useState(false);
  const blocked = locationStatus === 'denied' || locationStatus === 'unavailable';
  const disabled = blocked || position === null;

  const press = () => {
    if (!position) return;
    if (!inBounds(position.point, madridConfig.bounds)) {
      setOutside(true);
      return;
    }
    setOutside(false);
    onPress({ mode: 'around', point: position.point });
  };

  return (
    <div className="around">
      <button
        type="button"
        className="btn btn-primary btn-around"
        disabled={disabled}
        onClick={press}
      >
        Around me
      </button>
      {blocked && (
        <p className="note" role="status">
          Turn on location to use this. iOS Safari: Settings &gt; Privacy &amp; Security &gt;
          Location Services &gt; Safari Websites. Android Chrome: site settings &gt; Permissions
          &gt; Location.
        </p>
      )}
      {!blocked && position === null && (
        <p className="note" role="status">
          Waiting for your location…
        </p>
      )}
      {outside && (
        <p className="note" role="alert">
          You&apos;re outside the Madrid SER area
        </p>
      )}
    </div>
  );
}
