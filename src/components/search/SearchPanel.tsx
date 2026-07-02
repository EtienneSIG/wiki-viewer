import { useEffect, useMemo, useRef, useState } from 'react';
import type { WikiModel } from '../../lib/wiki';
import { searchWiki, type SearchSegment } from '../../lib/search';
import { t } from '../../lib/i18n';

export interface SearchPanelProps {
  model: WikiModel;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

function renderSegments(segments: SearchSegment[]): JSX.Element[] {
  return segments.map((seg, i) =>
    seg.hit ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
  );
}

/** Command-palette style full-text search over the open wiki. */
export function SearchPanel({ model, onNavigate, onClose }: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchWiki(model, query), [model, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the active result scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const choose = (path: string): void => {
    onNavigate(path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) choose(r.path);
    }
  };

  return (
    <div
      className="wv-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('search.title')}
      onClick={onClose}
    >
      <div className="wv-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wv-search-input-row">
          <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="wv-search-input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('search.title')}
          />
          <kbd className="wv-search-esc">Esc</kbd>
        </div>

        <div className="wv-search-results">
          {query.trim() === '' ? (
            <p className="wv-search-hint">{t('search.hint')}</p>
          ) : results.length === 0 ? (
            <p className="wv-search-empty">{t('search.noResults')}</p>
          ) : (
            <ul ref={listRef} className="wv-search-list">
              {results.map((r, i) => (
                <li key={r.path}>
                  <button
                    type="button"
                    className={i === active ? 'wv-search-item is-active' : 'wv-search-item'}
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(r.path)}
                  >
                    <span className="wv-search-item-title">{renderSegments(r.titleSegments)}</span>
                    <span className="wv-search-item-path">
                      {r.category ? `${r.category} · ` : ''}
                      {r.path}
                    </span>
                    {r.snippet.length > 0 && (
                      <span className="wv-search-item-snippet">{renderSegments(r.snippet)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {results.length > 0 && (
          <div className="wv-search-footer">{t('search.count', { count: results.length })}</div>
        )}
      </div>
    </div>
  );
}
