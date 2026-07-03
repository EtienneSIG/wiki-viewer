/**
 * Fenced-code syntax highlighting (FR-002) via Shiki.
 *
 * Shiki is asynchronous and heavyweight, so it is loaded lazily and used by the
 * UI layer after the synchronous `renderHtml` pass. The synchronous render
 * emits `language-*` class hooks on code blocks; this module upgrades them to
 * fully tokenized markup when called by the client.
 */
import type { HighlighterCore } from 'shiki/core';

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    const [{ createHighlighterCore }, { createOnigurumaEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/oniguruma'),
    ]);
    // Fine-grained bundle: only the themes and languages actually used are
    // pulled into the build, instead of Shiki's full ~270-language registry.
    highlighterPromise = createHighlighterCore({
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ],
      langs: [
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
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
