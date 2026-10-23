import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../adapters/geocoder';
import type { GeoResult } from '../adapters/geocoder';
import { madridConfig } from '../cities/madrid/config';
import { useI18n } from '../i18n';

interface Props {
  onSelect: (r: GeoResult) => void;
  search?: typeof searchPlaces;
}

const DEBOUNCE_MS = 300;

export default function SearchBar({ onSelect, search = searchPlaces }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;
    if (!q) {
      setResults([]);
      setMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      search(q, madridConfig).then(
        (r) => {
          if (id !== seq.current) return;
          setResults(r);
          setMessage(r.length === 0 ? t('search.noResults') : null);
        },
        () => {
          if (id !== seq.current) return;
          setResults([]);
          setMessage(t('search.unavailable'));
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search, t]);

  return (
    <div className="search">
      <input
        type="search"
        className="search-input"
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="suggestions">
          {results.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <button
                type="button"
                className="suggestion"
                onClick={() => {
                  setResults([]);
                  setQuery('');
                  onSelect(r);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className="note" role="status">
          {message} {t('search.hint')}
        </p>
      )}
    </div>
  );
}
