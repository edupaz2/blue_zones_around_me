import { useState } from 'react';
import type { LocationStatus, Position } from '../adapters/location';
import { madridConfig } from '../cities/madrid/config';
import { inBounds } from '../core/bounds';
import type { Origin } from '../core/types';
import { useI18n } from '../i18n';

interface Props {
  position: Position | null;
  locationStatus: LocationStatus;
  onPress: (origin: Origin) => void;
}

export default function AroundMeButton({ position, locationStatus, onPress }: Props) {
  const { t } = useI18n();
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
        {t('around.button')}
      </button>
      {blocked && (
        <p className="note" role="status">
          {t('around.enableLocation')}
        </p>
      )}
      {!blocked && position === null && (
        <p className="note" role="status">
          {t('around.waiting')}
        </p>
      )}
      {outside && (
        <p className="note" role="alert">
          {t('around.outside')}
        </p>
      )}
    </div>
  );
}
