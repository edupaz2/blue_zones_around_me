import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../adapters/geocoder';
import type { GeoResult } from '../adapters/geocoder';
import { madridConfig } from '../cities/madrid/config';

interface Props {
  onSelect: (r: GeoResult) => void;
  search?: typeof searchPlaces;
}

const DEBOUNCE_MS = 300;
const HINT = 'You can also long-press the map to set a destination.';

export default function SearchBar({ onSelect, search = searchPlaces }: Props) {
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
          setMessage(r.length === 0 ? 'No results.' : null);
        },
        () => {
          if (id !== seq.current) return;
          setResults([]);
          setMessage("Search isn't available right now.");
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="search">
      <input
        type="search"
        className="search-input"
        placeholder="Where are you going?"
        aria-label="Search destination"
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
          {message} {HINT}
        </p>
      )}
    </div>
  );
}
