import { en } from './messages.en';
import type { MessageKey } from './messages.en';
import { es } from './messages.es';

export type Locale = 'en' | 'es';

const catalogs: Record<Locale, Record<string, string>> = { en, es };

/** Keys callers may pass: plain keys plus plural bases (`card.spaces` for `_one`/`_other`). */
export type TranslationKey = MessageKey extends infer K
  ? K extends `${infer B}_${'one' | 'other'}`
    ? B | K
    : K
  : never;

export type Params = Record<string, string | number>;

/** First entry of the preference list whose primary subtag is supported wins; otherwise English. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  for (const tag of languages ?? []) {
    const primary = tag.split(/[-_]/)[0]?.toLowerCase();
    if (primary === 'es' || primary === 'en') return primary;
  }
  return 'en';
}

export function detectFromNavigator(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectLocale(list.filter((l): l is string => typeof l === 'string'));
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

function lookup(catalog: Record<string, string>, locale: Locale, key: string, params?: Params) {
  if (typeof params?.count === 'number') {
    const rule = new Intl.PluralRules(locale).select(params.count);
    const plural = catalog[`${key}_${rule}`] ?? catalog[`${key}_other`];
    if (plural !== undefined) return plural;
  }
  return catalog[key];
}

/** Never throws: missing keys fall back to English, then to the key itself. */
export function formatMessage(
  locale: Locale,
  key: TranslationKey,
  params?: Params,
  catalog: Record<string, string> = catalogs[locale],
): string {
  const template = lookup(catalog, locale, key, params) ?? lookup(en, 'en', key, params) ?? key;
  return interpolate(template, params);
}

export function formatNumber(locale: Locale, n: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(n);
}

/** English keeps the ISO date (YYYY-MM-DD); Spanish spells it out. Unparseable input is returned as is. */
export function formatDate(locale: Locale, isoDate: string): string {
  if (locale === 'en') return isoDate;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(t);
}
