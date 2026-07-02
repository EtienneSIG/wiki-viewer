import type { WikiModel } from '../../lib/wiki';

export interface BacklinksProps {
  model: WikiModel;
  activePath: string;
  onNavigate: (path: string) => void;
}

/** Right-hand panel: pages that link to the current page (like Obsidian backlinks). */
export function Backlinks({ model, activePath, onNavigate }: BacklinksProps): JSX.Element {
  const sources = model.backlinks.get(activePath) ?? [];
  const active = model.byPath.get(activePath);
  const outgoing = (active?.outLinks ?? []).filter((p) => model.byPath.has(p));

  return (
    <aside className="wv-backlinks" aria-label="Liens">
      <section>
        <h3 className="wv-backlinks-title">
          Backlinks <span className="wv-count">{sources.length}</span>
        </h3>
        {sources.length === 0 ? (
          <p className="wv-backlinks-empty">Aucune page ne pointe ici.</p>
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
          Liens sortants <span className="wv-count">{outgoing.length}</span>
        </h3>
        {outgoing.length === 0 ? (
          <p className="wv-backlinks-empty">Cette page ne pointe vers rien.</p>
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
