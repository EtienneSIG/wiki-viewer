/**
 * Lightweight full-text search over an open wiki. Runs entirely in memory on
 * the already-loaded model — nothing leaves the device. Matches page titles,
 * body content and paths, ranks title hits highest, and returns a short
 * highlighted snippet around the first content match.
 */
import type { WikiModel } from './wiki';

export interface SearchSegment {
  text: string;
  hit: boolean;
}

export interface SearchResult {
  path: string;
  title: string;
  category: string;
  score: number;
  /** Title split into highlighted / plain segments. */
  titleSegments: SearchSegment[];
  /** Content excerpt split into highlighted / plain segments. */
  snippet: SearchSegment[];
}

const SNIPPET_RADIUS = 60;
const SNIPPET_FALLBACK = 140;

/** Strip frontmatter and common Markdown syntax to plain, searchable text. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') // YAML frontmatter
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images → keep label
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, tgt, alias) => alias || tgt) // wikilinks
    .replace(/[#>*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build highlighted segments for `text` given the lowercased search `terms`. */
function highlight(text: string, terms: string[]): SearchSegment[] {
  if (!text || terms.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (!term) continue;
    let i = lower.indexOf(term);
    while (i !== -1) {
      ranges.push([i, i + term.length]);
      i = lower.indexOf(term, i + term.length);
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const segments: SearchSegment[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) segments.push({ text: text.slice(pos, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), hit: false });
  return segments;
}

/**
 * Search the wiki for `query`. Terms are matched case-insensitively; a page is
 * only returned when it matches every term (AND). Results are ordered by
 * relevance (title matches first) and capped at `limit`.
 */
export function searchWiki(model: WikiModel, query: string, limit = 40): SearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const terms = Array.from(new Set(normalized.split(/\s+/).filter(Boolean)));

  const results: SearchResult[] = [];
  for (const file of model.files) {
    const title = file.title || file.slug;
    const titleLower = title.toLowerCase();
    const pathLower = file.path.toLowerCase();
    const plain = toPlainText(file.content || '');
    const plainLower = plain.toLowerCase();

    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const inTitle = titleLower.includes(term);
      const inBody = plainLower.includes(term);
      const inPath = pathLower.includes(term);
      if (inTitle) score += 10;
      if (inBody) score += 2;
      if (inPath) score += 1;
      if (!inTitle && !inBody && !inPath) {
        matchedAll = false;
        break;
      }
    }
    if (!matchedAll || score === 0) continue;

    if (titleLower === normalized) score += 60;
    else if (titleLower.startsWith(normalized)) score += 25;

    // Snippet around the earliest body match, else the start of the page.
    let firstIdx = -1;
    let firstLen = 0;
    for (const term of terms) {
      const i = plainLower.indexOf(term);
      if (i !== -1 && (firstIdx === -1 || i < firstIdx)) {
        firstIdx = i;
        firstLen = term.length;
      }
    }
    let snippet: SearchSegment[];
    if (firstIdx !== -1) {
      const start = Math.max(0, firstIdx - SNIPPET_RADIUS);
      const end = Math.min(plain.length, firstIdx + firstLen + SNIPPET_RADIUS);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < plain.length ? '…' : '';
      snippet = highlight(prefix + plain.slice(start, end) + suffix, terms);
    } else {
      snippet = highlight(plain.slice(0, SNIPPET_FALLBACK), terms);
    }

    results.push({
      path: file.path,
      title,
      category: file.category,
      score,
      titleSegments: highlight(title, terms),
      snippet,
    });
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, limit);
}
