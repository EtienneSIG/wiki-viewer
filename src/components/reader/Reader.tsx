import { useCallback, useEffect, useMemo, useRef } from 'react';
import { parse } from '../../markdown/parse';
import { renderHtml } from '../../markdown/render';
import { highlightCode } from '../../markdown/highlight';
import { SHIKI_THEME_FOR } from '../../app/theme';
import { LARGE_FILE_THRESHOLD_BYTES, type ThemeId } from '../../lib/types';
import type { WikiResolveResult } from '../../markdown/remark-wikilink';
import { t } from '../../lib/i18n';

export interface ReaderProps {
  markdown: string;
  allowRemoteContent: boolean;
  theme: ThemeId;
  /** Resolve `[[wikilinks]]` to navigable hrefs; omit to render them as text. */
  wikiResolve?: (target: string) => WikiResolveResult;
  /** Called when the user clicks a resolved wikilink (path relative to root). */
  onNavigate?: (path: string) => void;
}

/**
 * Read view (US1, FR-002): renders Markdown to sanitized HTML via the engine.
 * Syntax highlighting is applied progressively after paint so it never blocks
 * first render of large files (SC-002 graceful degradation). Files above the
 * documented threshold skip highlighting entirely to stay responsive (T029).
 */
export function Reader({
  markdown,
  allowRemoteContent,
  theme,
  wikiResolve,
  onNavigate,
}: ReaderProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  // Documented graceful degradation for very large files (Edge Case, T029).
  const isLargeFile = useMemo(
    () => new Blob([markdown]).size > LARGE_FILE_THRESHOLD_BYTES,
    [markdown],
  );

  const html = useMemo(
    () => renderHtml(parse(markdown), { allowRemoteContent, highlight: !isLargeFile, wikiResolve }),
    [markdown, allowRemoteContent, isLargeFile, wikiResolve],
  );

  // Intercept clicks: wikilinks navigate inside the wiki; external links open
  // in a new tab so the single-page app is never navigated away.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#wiki/')) {
        e.preventDefault();
        if (anchor.classList.contains('wikilink-missing')) return;
        const path = decodeURIComponent(href.slice('#wiki/'.length));
        onNavigate?.(path);
      } else if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    },
    [onNavigate],
  );

  // Progressive, non-blocking syntax highlighting of fenced code blocks.
  // Skipped for large files to keep scrolling/interaction responsive.
  useEffect(() => {
    if (isLargeFile) return;
    let cancelled = false;
    const root = containerRef.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll('pre > code[class*="language-"]'));
    (async () => {
      for (const block of blocks) {
        if (cancelled) return;
        const lang = /language-([\w-]+)/.exec(block.className)?.[1] ?? 'text';
        const highlighted = await highlightCode(
          block.textContent ?? '',
          lang,
          SHIKI_THEME_FOR[theme],
        );
        if (cancelled) return;
        const pre = block.parentElement;
        if (pre) pre.outerHTML = highlighted;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html, theme, isLargeFile]);

  return (
    <article
      ref={containerRef}
      className="markdit-reader"
      // Accessibility (T030, FR-013): a labelled document region, screen-reader
      // friendly, keyboard-scrollable.
      role="document"
      aria-label={t('view.read')}
      tabIndex={0}
      onClick={handleClick}
    >
      {isLargeFile && (
        <p className="markdit-notice" role="status">
          {t('notice.largeFile')}
        </p>
      )}
      <div
        // HTML is sanitized by the engine (rehype-sanitize) before reaching here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
