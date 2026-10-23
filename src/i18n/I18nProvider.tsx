import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { detectFromNavigator, formatDate, formatMessage, formatNumber } from './core';
import type { Locale, Params, TranslationKey } from './core';

export interface I18n {
  locale: Locale;
  t: (key: TranslationKey, params?: Params) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (isoDate: string) => string;
}

function build(locale: Locale): I18n {
  return {
    locale,
    t: (key, params) => formatMessage(locale, key, params),
    formatNumber: (n, options) => formatNumber(locale, n, options),
    formatDate: (iso) => formatDate(locale, iso),
  };
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Detected once at mount; the language does not change while the app runs.
  const value = useMemo(() => build(detectFromNavigator()), []);
  useEffect(() => {
    document.documentElement.lang = value.locale;
    document.title = value.t('app.title');
  }, [value]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Works without a provider by detecting from `navigator` (used by isolated component tests). */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  const fallback = useMemo(() => (ctx ? null : build(detectFromNavigator())), [ctx]);
  return ctx ?? fallback!;
}
