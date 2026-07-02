/**
 * Fenced-code syntax highlighting (FR-002) via Shiki.
 *
 * Shiki is asynchronous and heavyweight, so it is loaded lazily and used by the
 * UI layer after the synchronous `renderHtml` pass. The synchronous render
 * emits `language-*` class hooks on code blocks; this module upgrades them to
 * fully tokenized markup when called by the client.
 */
import type { Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

const DEFAULT_LANGS = [
  'javascript',
  'typescript',
  'json',
  'bash',
  'python',
  'rust',
  'markdown',
  'html',
  'css',
];

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    const { createHighlighter } = await import('shiki');
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: DEFAULT_LANGS,
    });
  }
  return highlighterPromise;
}

/** Highlight a single code block to HTML. Falls back to escaped plain text. */
export async function highlightCode(
  code: string,
  lang: string | null,
  theme: 'github-light' | 'github-dark' = 'github-light',
): Promise<string> {
  try {
    const hl = await getHighlighter();
    const language = lang && hl.getLoadedLanguages().includes(lang) ? lang : 'text';
    return hl.codeToHtml(code, { lang: language, theme });
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
