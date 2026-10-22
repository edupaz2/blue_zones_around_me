import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../core/types';
import SettingsSheet from './SettingsSheet';

afterEach(cleanup);
const base: Settings = { showVisitor: true, showResident: true, navApp: null };

function setup(settings: Settings = base) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SettingsSheet
      settings={settings}
      sourceDate="2026-09-30"
      onChange={onChange}
      onClose={onClose}
    />,
  );
  return { onChange, onClose };
}

describe('SettingsSheet', () => {
  it('is a dialog with the first control focused', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('checkbox', { name: /Zona azul/ })).toHaveFocus();
  });

  it('toggles blue and green independently', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zona azul (blue) zones' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, showVisitor: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zona verde (green) zones' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, showResident: false });
  });

  it('changes the navigation app', () => {
    const { onChange } = setup();
    expect(screen.getByRole('radio', { name: 'Google Maps' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Waze' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Waze' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, navApp: 'waze' });
  });

  it('checks the current navigation app', () => {
    setup({ ...base, navApp: 'google' });
    expect(screen.getByRole('radio', { name: 'Google Maps' })).toBeChecked();
  });

  it('shows the data date', () => {
    setup();
    expect(screen.getByText('Zone data date: 2026-09-30')).toBeInTheDocument();
  });

  it('closes with the button and Escape', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
