import { useEffect, useRef } from 'react';
import { madridConfig } from '../cities/madrid/config';
import type { Settings } from '../core/types';

interface Props {
  settings: Settings;
  sourceDate: string;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

const { visitor, resident } = madridConfig.kinds;

export default function SettingsSheet({ settings, sourceDate, onChange, onClose }: Props) {
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <label className="setting-row">
          <input
            ref={firstRef}
            type="checkbox"
            checked={settings.showVisitor}
            onChange={(e) => onChange({ ...settings, showVisitor: e.target.checked })}
          />
          {visitor.label} (blue) zones
        </label>
        <label className="setting-row">
          <input
            type="checkbox"
            checked={settings.showResident}
            onChange={(e) => onChange({ ...settings, showResident: e.target.checked })}
          />
          {resident.label} (green) zones
        </label>
        <fieldset className="setting-group">
          <legend>Navigation app</legend>
          <label className="setting-row">
            <input
              type="radio"
              name="nav-app"
              checked={settings.navApp === 'google'}
              onChange={() => onChange({ ...settings, navApp: 'google' })}
            />
            Google Maps
          </label>
          <label className="setting-row">
            <input
              type="radio"
              name="nav-app"
              checked={settings.navApp === 'waze'}
              onChange={() => onChange({ ...settings, navApp: 'waze' })}
            />
            Waze
          </label>
        </fieldset>
        <p className="note">Zone data date: {sourceDate}</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
