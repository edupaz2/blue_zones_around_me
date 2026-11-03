import type { CityConfig } from '../core/types';
import { barcelonaConfig } from './barcelona/config';
import { madridConfig } from './madrid/config';

const cities: Record<string, CityConfig> = {
  madrid: madridConfig,
  barcelona: barcelonaConfig,
};

const id = (import.meta.env.VITE_CITY as string | undefined) ?? 'madrid';
const found = cities[id];
if (!found) {
  throw new Error(`Unknown VITE_CITY "${id}" (expected one of: ${Object.keys(cities).join(', ')})`);
}

/** The city this build serves, picked at build time by the VITE_CITY env var (default: madrid). */
export const city: CityConfig = found;
