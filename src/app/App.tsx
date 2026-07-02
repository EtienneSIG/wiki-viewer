import { useCallback, useEffect, useMemo, useState } from 'react';
import { Reader } from '../components/reader/Reader';
import { ExcalidrawView } from '../components/reader/ExcalidrawView';
import { Editor } from '../components/editor/Editor';
import { FileTree } from '../components/sidebar/FileTree';
import { Backlinks } from '../components/backlinks/Backlinks';
import { GraphView } from '../components/graph/GraphView';
import { StatusBar } from '../components/statusbar/StatusBar';
import { scanEntries, buildLightModel, readEntries, buildModel, type WikiModel } from '../lib/wiki';
import { buildContactsGraph } from '../lib/contacts';
import { splitFrontmatter, joinFrontmatter } from '../lib/frontmatter';
import { writeFileHandle, loadFolders, saveFolders, readFileAtPath } from '../lib/folder-handle';
import { applyTheme } from './theme';
import { t, getLocale, setLocale, type Locale } from '../lib/i18n';
import type { ThemeId } from '../lib/types';

type ViewMode = 'read' | 'edit' | 'graph' | 'contacts';

/** Delay after the last keystroke before autosave writes to disk. */
const AUTOSAVE_DELAY_MS = 1000;
/** localStorage key remembering the autosave preference across sessions. */
const AUTOSAVE_KEY = 'wv-autosave';

const THEMES: ThemeId[] = ['system', 'light', 'dark', 'high-contrast'];

function resolveTheme(theme: ThemeId): ThemeId {
  if (theme !== 'system') return theme;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  return dark ? 'dark' : 'light';
}

/** Prefer the wiki entry point, then a README, else the first file. */
function pickInitial(model: WikiModel): string | null {
  if (model.files.length === 0) return null;
  const byName = (n: string): string | undefined =>
    model.files.find((f) => f.name.toLowerCase() === n)?.path;
  return byName('index.md') ?? byName('readme.md') ?? model.files[0].path;
}

export function App(): JSX.Element {
  const [model, setModel] = useState<WikiModel | null>(null);
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [reopenDir, setReopenDir] = useState<FileSystemDirectoryHandle | null>(null);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [frontmatterRaw, setFrontmatterRaw] = useState('');
  const [dirty, setDirty] = useState(false);

  const [view, setView] = useState<ViewMode>('read');
  const [theme, setTheme] = useState<ThemeId>('system');
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [autosave, setAutosave] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTOSAVE_KEY) !== '0';
    } catch {
      return true;
    }
  });

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);
  const activeFile = model && activePath ? model.byPath.get(activePath) ?? null : null;
  const isExcalidraw = activeFile?.kind === 'excalidraw';

  // Second graph: customer contacts only, derived from the contacts directory
  // page. Rebuilt whenever the model changes (i.e. after background indexing
  // populates page contents).
  const contacts = useMemo(() => (model ? buildContactsGraph(model) : null), [model]);

  // Resolve a root-relative asset path (e.g. an image referenced from Markdown)
  // to an object URL, reading it from the opened folder. Stays offline-first.
  const resolveAsset = useCallback(
    async (path: string): Promise<string | null> => {
      if (!rootDir) return null;
      const file = await readFileAtPath(rootDir, path);
      if (!file) return null;
      return URL.createObjectURL(file);
    },
    [rootDir],
  );

  // Load the frontmatter/body of a file within a given model. Content is read
  // lazily from disk on first open (the model may only hold entry metadata).
  const openFile = useCallback(async (m: WikiModel, path: string): Promise<void> => {
    const file = m.byPath.get(path);
    if (!file) return;
    let content = file.content;
    if (!content) {
      try {
        content = await (await file.handle.getFile()).text();
        file.content = content; // cache on the model
      } catch {
        content = '';
      }
    }
    const { raw, body: bodyText } = splitFrontmatter(content);
    setFrontmatterRaw(raw);
    setBody(bodyText);
    setActivePath(path);
    setDirty(false);
  }, []);

  const loadFromDir = useCallback(
    async (dir: FileSystemDirectoryHandle): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        // Phase 1 (instant): enumerate files, show the tree, open the first page.
        const t0 = performance.now();
        const { rootName, entries } = await scanEntries(dir);
        console.info(
          `[wiki] enumerated ${entries.length} file(s) in "${rootName}" in ${Math.round(
            performance.now() - t0,
          )}ms`,
        );
        const light = buildLightModel(rootName, entries);
        setModel(light);
        setRootDir(dir);
        setReopenDir(null);
        void saveFolders([dir]);
        if (entries.length === 0) {
          setError(t('error.noMarkdownIn', { name: rootName }));
        }
        const initial = pickInitial(light);
        if (initial) {
          await openFile(light, initial);
          setView('read');
        }
        setLoading(false);
        // Phase 2 (background): read every file, compute graph + backlinks.
        if (entries.length > 0) {
          setIndexing(true);
          const files = await readEntries(entries);
          setModel(buildModel(rootName, files));
          setIndexing(false);
          console.info(`[wiki] indexed ${files.length} file(s) in ${Math.round(performance.now() - t0)}ms`);
        }
      } catch (err) {
        console.error('[wiki] open failed:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        setIndexing(false);
      }
    },
    [openFile],
  );

  // Restore the last opened wiki (or offer to re-grant permission).
  useEffect(() => {
    applyTheme(theme);
    void (async () => {
      const dirs = await loadFolders();
      const dir = dirs[0];
      if (!dir) return;
      const perm = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
      if (perm === 'granted') await loadFromDir(dir);
      else setReopenDir(dir);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Reflect the active locale on the document element for a11y / CSS hooks.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const openWiki = useCallback(async (): Promise<void> => {
    if (!window.showDirectoryPicker) {
      setError(t('sidebar.unsupported'));
      return;
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      await loadFromDir(dir);
    } catch {
      // User cancelled the picker — nothing to do.
    }
  }, [loadFromDir]);

  const reopen = useCallback(async (): Promise<void> => {
    if (!reopenDir) return;
    const perm = (await reopenDir.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (perm === 'granted') await loadFromDir(reopenDir);
  }, [reopenDir, loadFromDir]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!rootDir) return;
    const keep = activePath;
    await loadFromDir(rootDir);
    if (keep) setActivePath(keep);
  }, [rootDir, activePath, loadFromDir]);

  const openPath = useCallback(
    (path: string): void => {
      if (!model) return;
      if (dirty && !window.confirm(t('confirm.unsaved'))) return;
      void openFile(model, path);
      // Excalidraw diagrams have no editable source view; always show them in read.
      const target = model.byPath.get(path);
      if (view === 'graph' || view === 'contacts' || target?.kind === 'excalidraw') setView('read');
    },
    [model, dirty, view, openFile],
  );

  // Clicking a contacts-graph node opens its mapped wiki page (the directory,
  // or the client hub for account nodes) rather than the synthetic node id.
  const openContactNode = useCallback(
    (nodeId: string): void => {
      const target = contacts?.openTargets.get(nodeId);
      if (target) openPath(target);
    },
    [contacts, openPath],
  );

  const handleSave = useCallback(async (): Promise<void> => {
    if (!model || !activePath) return;
    const file = model.byPath.get(activePath);
    if (!file) return;
    setSaveStatus('saving');
    try {
      const full = joinFrontmatter(frontmatterRaw, body);
      const ok = await writeFileHandle(file.handle, full);
      if (ok) {
        file.content = full;
        setModel(buildModel(model.rootName, model.files));
        setDirty(false);
        setSaveStatus('saved');
      } else {
        setSaveStatus('failed');
      }
    } catch {
      setSaveStatus('failed');
    }
    window.setTimeout(() => setSaveStatus('idle'), 2500);
  }, [model, activePath, frontmatterRaw, body]);

  // Ctrl/Cmd+S saves the current page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  // Persist the autosave preference across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, autosave ? '1' : '0');
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [autosave]);

  // Autosave: while editing, persist to disk shortly after the user stops
  // typing. Reuses handleSave (which leaves `body` untouched, so the editor
  // never re-syncs and the caret is preserved). Gated on `dirty` so opening a
  // file — which resets dirty=false — never triggers a spurious write.
  useEffect(() => {
    if (!autosave) return;
    if (view !== 'edit') return;
    if (!dirty) return;
    if (!activeFile || isExcalidraw) return;
    const id = window.setTimeout(() => {
      void handleSave();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [autosave, view, dirty, body, frontmatterRaw, activeFile, isExcalidraw, handleSave]);

  const cycleTheme = useCallback(() => {
    setTheme((cur) => THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((cur) => setLocale(cur === 'fr' ? 'en' : 'fr'));
  }, []);

  const fileLabel = activeFile?.name ?? '—';

  return (
    <div className="markdit-app">
      <header className="markdit-topbar">
        <div className="markdit-topbar-left">
          <button
            type="button"
            className="markdit-burger"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={t('sidebar.toggle')}
            aria-pressed={!sidebarCollapsed}
            title={t('sidebar.toggle')}
          >
            <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>
          <span className="markdit-brand">
            <span className="markdit-brand-mark" aria-hidden="true">W</span>
            {t('brand.wiki')}
          </span>
          {model && (
            <>
              <span className="markdit-breadcrumb-sep" aria-hidden="true">›</span>
              <span className="markdit-filename" title={model.rootName}>{model.rootName}</span>
              {activeFile && (
                <>
                  <span className="markdit-breadcrumb-sep" aria-hidden="true">›</span>
                  <span className="markdit-filename" title={activePath ?? fileLabel}>
                    {fileLabel}
                    {dirty ? ' •' : ''}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {model && (
          <div className="markdit-topbar-center">
            <div className="markdit-segmented" role="group" aria-label={t('view.mode')}>
              <button type="button" onClick={() => setView('read')} aria-pressed={view === 'read'} disabled={!activeFile}>
                {t('view.read')}
              </button>
              <button type="button" onClick={() => setView('edit')} aria-pressed={view === 'edit'} disabled={!activeFile || isExcalidraw}>
                {t('view.edit')}
              </button>
              <button type="button" onClick={() => setView('graph')} aria-pressed={view === 'graph'}>
                {t('view.graph')}
              </button>
              <button type="button" onClick={() => setView('contacts')} aria-pressed={view === 'contacts'}>
                {t('view.contacts')}
              </button>
            </div>
          </div>
        )}

        <nav className="markdit-topbar-right markdit-actions" aria-label="Actions">
          <button type="button" onClick={toggleLocale} title={t('lang.toggle')} aria-label={t('lang.toggle')}>
            <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            {t('lang.short')}
          </button>
          <button type="button" onClick={cycleTheme} title={t('action.themeTitle', { theme })} aria-label={t('action.themeToggle')}>
            <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
            </svg>
          </button>
          {model && (
            <button
              type="button"
              className={autosave ? 'is-active' : undefined}
              onClick={() => setAutosave((v) => !v)}
              aria-pressed={autosave}
              title={autosave ? t('action.autosaveOn') : t('action.autosaveOff')}
            >
              <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
              {t('action.autosave')}
            </button>
          )}
          {model && (
            <button type="button" onClick={handleSave} disabled={!activeFile || isExcalidraw || saveStatus === 'saving'} title={t('action.save')}>
              <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {saveStatus === 'saved' ? (
                  <path d="m5 13 4 4L19 7" />
                ) : (
                  <>
                    <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                    <path d="M8 4v5h7V4M8 21v-7h8v7" />
                  </>
                )}
              </svg>
              {saveStatus === 'saving' ? t('action.saving') : saveStatus === 'saved' ? t('action.saved') : saveStatus === 'failed' ? t('action.saveFailed') : t('action.save')}
            </button>
          )}
          <button type="button" className="is-primary" onClick={openWiki}>
            <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {t('action.openWiki')}
          </button>
        </nav>
      </header>

      <div className="markdit-body">
        {model && !sidebarCollapsed && (
          <aside className="markdit-sidebar" aria-label={t('sidebar.title')}>
            <div className="markdit-sidebar-header">
              <strong title={model.rootName}>{model.rootName}</strong>
              <div className="markdit-sidebar-header-actions">
                <button
                  type="button"
                  className="markdit-icon-button wv-refresh-button"
                  onClick={refresh}
                  disabled={loading}
                  title={t('sidebar.refresh')}
                  aria-label={t('sidebar.refresh')}
                >
                  <svg className={`markdit-icon${loading ? ' is-spinning' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  <span className="wv-refresh-label">{t('sidebar.refreshShort')}</span>
                </button>
              </div>
            </div>
            <div className="markdit-sidebar-body">
              <span className="wv-count wv-filecount">
                {t('sidebar.pageCount', { count: model.files.length })}
                {indexing && <span className="wv-indexing"> · {t('status.indexing')}</span>}
              </span>
              {error && <p className="wv-empty-error wv-sidebar-error">{error}</p>}
              {model.files.length === 0 && !error && (
                <p className="markdit-sidebar-empty">{t('sidebar.noPages')}</p>
              )}
              <FileTree nodes={model.tree} activePath={activePath} onSelect={openPath} />
            </div>
          </aside>
        )}

        <main className={`markdit-main${model && (view === 'graph' || view === 'contacts') ? ' wv-main-graph' : ''}`}>
          {!model ? (
            <EmptyState onOpen={openWiki} reopenDir={reopenDir} onReopen={reopen} loading={loading} error={error} />
          ) : view === 'graph' ? (
            model.graph.links.length === 0 && indexing ? (
              <div className="wv-empty">
                <div className="wv-empty-card">
                  <p className="wv-empty-text">{t('graph.indexing')}</p>
                </div>
              </div>
            ) : (
              <GraphView graph={model.graph} activePath={activePath} onOpen={openPath} theme={resolvedTheme} />
            )
          ) : view === 'contacts' ? (
            contacts && contacts.contactCount > 0 ? (
              <GraphView
                graph={contacts.graph}
                activePath={activePath}
                onOpen={openContactNode}
                theme={resolvedTheme}
                searchPlaceholder={t('contacts.search')}
              />
            ) : (
              <div className="wv-empty">
                <div className="wv-empty-card">
                  <p className="wv-empty-text">
                    {indexing ? t('contacts.indexing') : t('contacts.empty')}
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="wv-doc">
              <div className="wv-doc-main">
                {activeFile && !isExcalidraw && (activeFile.tags.length > 0 || activeFile.category) && (
                  <div className="wv-properties">
                    {activeFile.category && <span className="wv-chip wv-chip-cat">{activeFile.category}</span>}
                    {activeFile.tags.map((tag) => (
                      <span key={tag} className="wv-chip">#{tag}</span>
                    ))}
                  </div>
                )}
                {activeFile ? (
                  isExcalidraw ? (
                    <ExcalidrawView source={body} />
                  ) : view === 'read' ? (
                    <Reader
                      markdown={body}
                      allowRemoteContent={false}
                      theme={resolvedTheme}
                      wikiResolve={model.resolve}
                      onNavigate={openPath}
                      basePath={activePath ?? undefined}
                      resolveAsset={resolveAsset}
                    />
                  ) : (
                    <Editor
                      markdown={body}
                      onChange={(md) => {
                        setBody(md);
                        setDirty(true);
                      }}
                    />
                  )
                ) : (
                  <p className="markdit-sidebar-empty">{t('reader.selectPage')}</p>
                )}
              </div>
              {activePath && view === 'read' && !isExcalidraw && (
                <Backlinks model={model} activePath={activePath} onNavigate={openPath} />
              )}
            </div>
          )}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

interface EmptyStateProps {
  onOpen: () => void;
  reopenDir: FileSystemDirectoryHandle | null;
  onReopen: () => void;
  loading: boolean;
  error: string | null;
}

function EmptyState({ onOpen, reopenDir, onReopen, loading, error }: EmptyStateProps): JSX.Element {
  return (
    <div className="wv-empty">
      <div className="wv-empty-card">
        <svg className="wv-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <h1 className="wv-empty-title">{t('empty.title')}</h1>
        <p className="wv-empty-text">
          {t('empty.desc1')}
          <code>[[{t('empty.linkWord')}]]</code>
          {t('empty.desc2')}
        </p>
        {error && <p className="wv-empty-error">{error}</p>}
        <div className="wv-empty-actions">
          <button type="button" className="wv-empty-cta" onClick={onOpen} disabled={loading}>
            {loading ? t('empty.opening') : t('action.openWiki')}
          </button>
          {reopenDir && (
            <button type="button" className="wv-empty-reopen" onClick={onReopen} disabled={loading}>
              {t('empty.reopen', { name: reopenDir.name })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
