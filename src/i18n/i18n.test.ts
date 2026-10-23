import { describe, expect, it } from 'vitest';
import { en } from './messages.en';
import { es } from './messages.es';
import { detectLocale, formatDate, formatMessage, formatNumber } from './index';

describe('detectLocale', () => {
  it.each([
    [undefined, 'en'],
    [[], 'en'],
    [['en-GB'], 'en'],
    [['ES'], 'es'],
    [['es-MX'], 'es'],
    [['es'], 'es'],
    [['fr-FR', 'es-ES'], 'es'],
    [['en-US', 'es-ES'], 'en'],
    [['de', 'fr'], 'en'],
    [['fr'], 'en'],
  ] as const)('%j -> %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });
});

describe('formatMessage', () => {
  it('interpolates params', () => {
    expect(formatMessage('en', 'search.hint', undefined)).toContain('long-press');
    expect(formatMessage('en', 'card.show', { name: 'X' })).toBe('Show X on map');
    expect(formatMessage('es', 'card.show', { name: 'X' })).toBe('Mostrar X en el mapa');
  });
  it('picks plural forms', () => {
    expect(formatMessage('en', 'card.spaces', { count: 1 })).toBe('1 blue space');
    expect(formatMessage('en', 'card.spaces', { count: 12 })).toBe('12 blue spaces');
    expect(formatMessage('es', 'card.spaces', { count: 1 })).toBe('1 plaza azul');
    expect(formatMessage('es', 'card.spaces', { count: 12 })).toBe('12 plazas azules');
  });
  it('falls back to English, then to the key, and never throws', () => {
    expect(formatMessage('es', 'nope.missing' as never)).toBe('nope.missing');
    expect(formatMessage('es', 'nope.{x}' as never, { x: 1 })).toBe('nope.1');
    const broken = { ...es } as Record<string, string>;
    delete broken['panel.widen'];
    expect(formatMessage('es', 'panel.widen', undefined, broken)).toBe('Widen search');
  });
});

describe('number and date formatting', () => {
  it('uses locale separators', () => {
    expect(formatNumber('en', 1.2, { maximumFractionDigits: 1 })).toBe('1.2');
    expect(formatNumber('es', 1.2, { maximumFractionDigits: 1 })).toBe('1,2');
  });
  it('keeps ISO dates in English and spells them out in Spanish', () => {
    expect(formatDate('en', '2026-09-30')).toBe('2026-09-30');
    expect(formatDate('es', '2026-09-30')).toBe('30 de septiembre de 2026');
    expect(formatDate('es', 'garbage')).toBe('garbage');
  });
});

describe('catalog parity', () => {
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it('has identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('has no empty strings', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(v.trim(), k).not.toBe('');
    }
  });
  it('uses the same placeholders in both languages', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(names(es[k]), k).toEqual(names(en[k]));
    }
  });
});
