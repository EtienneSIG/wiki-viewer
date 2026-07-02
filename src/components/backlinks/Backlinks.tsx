import type { WikiModel } from '../../lib/wiki';
import { t } from '../../lib/i18n';

export interface BacklinksProps {
  model: WikiModel;
  activePath: string;
  onNavigate: (path: string) => void;
}

/** Hide index/underscore pages (e.g. `_index.md`) from the links panel. */
function isUnderscoreFile(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return base.startsWith('_');
}

/** Right-hand panel: pages that link to the current page (like Obsidian backlinks). */
export function Backlinks({ model, activePath, onNavigate }: BacklinksProps): JSX.Element {
  const sources = (model.backlinks.get(activePath) ?? []).filter((p) => !isUnderscoreFile(p));
  const active = model.byPath.get(activePath);
  const outgoing = (active?.outLinks ?? []).filter(
    (p) => model.byPath.has(p) && !isUnderscoreFile(p),
  );

  return (
    <aside className="wv-backlinks" aria-label={t('backlinks.aria')}>
      <section>
        <h3 className="wv-backlinks-title">
          {t('backlinks.title')} <span className="wv-count">{sources.length}</span>
        </h3>
        {sources.length === 0 ? (
          <p className="wv-backlinks-empty">{t('backlinks.none')}</p>
        ) : (
          <ul className="wv-backlinks-list">
            {sources.map((path) => (
              <li key={path}>
                <button type="button" onClick={() => onNavigate(path)} title={path}>
                  {model.byPath.get(path)?.title ?? path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="wv-backlinks-title">
          {t('backlinks.outgoing')} <span className="wv-count">{outgoing.length}</span>
        </h3>
        {outgoing.length === 0 ? (
          <p className="wv-backlinks-empty">{t('backlinks.outNone')}</p>
        ) : (
          <ul className="wv-backlinks-list">
            {outgoing.map((path) => (
              <li key={path}>
                <button type="button" onClick={() => onNavigate(path)} title={path}>
                  {model.byPath.get(path)?.title ?? path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
