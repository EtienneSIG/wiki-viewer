import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reader } from '../components/reader/Reader';
import { ExcalidrawView } from '../components/reader/ExcalidrawView';
import { Editor } from '../components/editor/Editor';
import { FileTree } from '../components/sidebar/FileTree';
import { Backlinks } from '../components/backlinks/Backlinks';
import { GraphView } from '../components/graph/GraphView';
import { StatusBar } from '../components/statusbar/StatusBar';
import { SearchPanel } from '../components/search/SearchPanel';
import { scanEntries, buildLightModel, readEntries, buildModel, buildClientTree, type WikiModel } from '../lib/wiki';
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

/** Right-hand links panel: persisted collapse/width and sizing bounds. */
const BACKLINKS_COLLAPSED_KEY = 'wv-backlinks-collapsed';
const BACKLINKS_WIDTH_KEY = 'wv-backlinks-width';
const BACKLINKS_MIN_WIDTH = 180;
const BACKLINKS_MAX_WIDTH = 520;
const BACKLINKS_DEFAULT_WIDTH = 240;

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [backlinksCollapsed, setBacklinksCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BACKLINKS_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [backlinksWidth, setBacklinksWidth] = useState<number>(() => {
    try {
      const n = parseInt(localStorage.getItem(BACKLINKS_WIDTH_KEY) ?? '', 10);
      return Number.isFinite(n)
        ? Math.min(BACKLINKS_MAX_WIDTH, Math.max(BACKLINKS_MIN_WIDTH, n))
        : BACKLINKS_DEFAULT_WIDTH;
    } catch {
      return BACKLINKS_DEFAULT_WIDTH;
    }
  });
  // Selected client slug for the filter (empty = whole wiki). Drives the file
  // tree, the page graph and the contacts graph together.
  const [clientFilter, setClientFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'failed'>('idle');
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
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

  // Sidebar file tree, optionally restricted to the selected client. A stale
  // selection (e.g. after opening another wiki) is ignored, and an empty
  // selection shows the full tree.
  const treeNodes = useMemo(() => {
    if (!model) return [];
    const active = clientFilter && model.clients.includes(clientFilter) ? clientFilter : '';
    return active ? buildClientTree(model.files, [active]) : model.tree;
  }, [model, clientFilter]);

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

  // Share the current page by email. On the desktop build this attaches the
  // Markdown file to a new Outlook message; in the browser it downloads the
  // file and opens a pre-filled mailto (attachments can't be set from a URL).
  const handleShareEmail = useCallback(async (): Promise<void> => {
    if (!activeFile || isExcalidraw) return;
    const content = joinFrontmatter(frontmatterRaw, body);
    const filename = activeFile.name.toLowerCase().endsWith('.md')
      ? activeFile.name
      : `${activeFile.name}.md`;

    if (window.desktop?.shareByEmail) {
      setShareStatus('sharing');
      try {
        const res = await window.desktop.shareByEmail({ filename, content });
        setShareStatus(res.ok ? 'idle' : 'failed');
      } catch {
        setShareStatus('failed');
      }
      window.setTimeout(() => setShareStatus('idle'), 2500);
      return;
    }

    // Browser fallback: download the Markdown so the user can attach it, then
    // open a pre-filled email.
    try {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      const subject = activeFile.title ?? filename;
      const mailBody = t('share.mailBody', { name: filename });
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
    } catch {
      setShareStatus('failed');
      window.setTimeout(() => setShareStatus('idle'), 2500);
    }
  }, [activeFile, isExcalidraw, frontmatterRaw, body]);

  // Download the current page as a Markdown file.
  const handleDownload = useCallback((): void => {
    if (!activeFile || isExcalidraw) return;
    const content = joinFrontmatter(frontmatterRaw, body);
    const filename = activeFile.name.toLowerCase().endsWith('.md')
      ? activeFile.name
      : `${activeFile.name}.md`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeFile, isExcalidraw, frontmatterRaw, body]);

  // Close the share menu on outside click or Escape.
  useEffect(() => {
    if (!shareMenuOpen) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shareMenuOpen]);

  // Persist the links-panel collapse/width preferences across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(BACKLINKS_COLLAPSED_KEY, backlinksCollapsed ? '1' : '0');
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [backlinksCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(BACKLINKS_WIDTH_KEY, String(backlinksWidth));
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [backlinksWidth]);

  // Drag the divider to resize the links panel (pointer capture on the divider).
  // The panel is on the right, so dragging left widens it.
  const startBacklinksResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = backlinksWidth;
      const onMove = (ev: PointerEvent): void => {
        const next = Math.min(
          BACKLINKS_MAX_WIDTH,
          Math.max(BACKLINKS_MIN_WIDTH, startWidth + (startX - ev.clientX)),
        );
        setBacklinksWidth(next);
      };
      const onUp = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
      };
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [backlinksWidth],
  );

  // Keyboard resizing for accessibility (arrow keys on the focused divider).
  const onBacklinksResizeKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setBacklinksWidth((w) => Math.min(BACKLINKS_MAX_WIDTH, w + 16));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setBacklinksWidth((w) => Math.max(BACKLINKS_MIN_WIDTH, w - 16));
    }
  }, []);

  // Ctrl/Cmd+S saves the current page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };    window.addEventListener('keydown', onKeyDown);
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

  // Ctrl/Cmd+K opens the full-text search palette (only with a wiki open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (model) setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [model]);

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
          {model && (
            <button type="button" onClick={() => setSearchOpen(true)} title={`${t('search.open')} (Ctrl/Cmd+K)`} aria-label={t('search.open')}>
              <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
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
            <div className="wv-share" ref={shareMenuRef}>
              <button
                type="button"
                className="wv-share-toggle"
                onClick={() => setShareMenuOpen((v) => !v)}
                disabled={!activeFile || isExcalidraw || shareStatus === 'sharing'}
                aria-haspopup="menu"
                aria-expanded={shareMenuOpen}
                title={t('share.title')}
              >
                <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                {shareStatus === 'sharing'
                  ? t('share.sharing')
                  : shareStatus === 'failed'
                    ? t('share.failed')
                    : t('share.title')}
                <svg className="markdit-icon wv-share-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {shareMenuOpen && (
                <div className="wv-share-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      void handleShareEmail();
                    }}
                  >
                    <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    {t('share.email')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      handleDownload();
                    }}
                  >
                    <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    {t('share.download')}
                  </button>
                </div>
              )}
            </div>
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
              <FileTree nodes={treeNodes} activePath={activePath} onSelect={openPath} />
            </div>
            {model.clients.length > 0 && (
              <div className="wv-sidebar-filter">
                <label className="wv-sidebar-filter-title" htmlFor="wv-client-filter">
                  {t('sidebar.filterClient')}
                </label>
                <select
                  id="wv-client-filter"
                  className="wv-sidebar-filter-select"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                >
                  <option value="">{t('sidebar.allClients')}</option>
                  {model.clients.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              <GraphView graph={model.graph} activePath={activePath} onOpen={openPath} theme={resolvedTheme} clientFilter={clientFilter} />
            )
          ) : view === 'contacts' ? (
            contacts && contacts.contactCount > 0 ? (
              <GraphView
                graph={contacts.graph}
                activePath={activePath}
                onOpen={openContactNode}
                theme={resolvedTheme}
                searchPlaceholder={t('contacts.search')}
                clientFilter={clientFilter}
                initialShowLabels
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
                backlinksCollapsed ? (
                  <button
                    type="button"
                    className="wv-backlinks-expand"
                    onClick={() => setBacklinksCollapsed(false)}
                    title={t('backlinks.expand')}
                    aria-label={t('backlinks.expand')}
                  >
                    <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                ) : (
                  <div className="wv-backlinks-wrap" style={{ flexBasis: `${backlinksWidth}px` }}>
                    <div
                      className="wv-backlinks-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      tabIndex={0}
                      onPointerDown={startBacklinksResize}
                      onKeyDown={onBacklinksResizeKey}
                      title={t('backlinks.resize')}
                      aria-label={t('backlinks.resize')}
                    />
                    <div className="wv-backlinks-panel">
                      <div className="wv-backlinks-toolbar">
                        <button
                          type="button"
                          className="markdit-icon-button"
                          onClick={() => setBacklinksCollapsed(true)}
                          title={t('backlinks.collapse')}
                          aria-label={t('backlinks.collapse')}
                        >
                          <svg className="markdit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      </div>
                      <Backlinks model={model} activePath={activePath} onNavigate={openPath} />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </main>
      </div>
      {model && searchOpen && (
        <SearchPanel model={model} onNavigate={openPath} onClose={() => setSearchOpen(false)} />
      )}
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
