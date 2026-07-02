/**
 * Minimal, dependency-free frontmatter handling.
 *
 * The wiki pages start with a YAML frontmatter block. We split it off so the
 * reader/editor work on the body only, then re-attach the *verbatim* block on
 * save (no lossy YAML round-trip). A tiny best-effort parser exposes the common
 * fields (title, tags, category, dates) for the properties panel and the graph.
 */

export interface ParsedFrontmatter {
  /** The raw frontmatter block, including the `---` fences and trailing newline. */
  raw: string;
  /** Best-effort parsed values (scalars as strings, sequences as string[]). */
  data: Record<string, string | string[]>;
  /** The Markdown body after the frontmatter. */
  body: string;
}

// Matches a leading `---\n ... \n---` block (optional BOM, CRLF tolerant).
const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function splitFrontmatter(md: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) return { raw: '', data: {}, body: md };
  return {
    raw: match[0],
    data: parseYamlLite(match[1]),
    body: md.slice(match[0].length),
  };
}

export function joinFrontmatter(raw: string, body: string): string {
  if (!raw) return body;
  return raw.endsWith('\n') ? raw + body : `${raw}\n${body}`;
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/** A deliberately tiny YAML subset: `key: scalar`, inline `[a, b]`, and block `- item` lists. */
function parseYamlLite(block: string): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const kv = /^([A-Za-z0-9_.$-]+):\s*(.*)$/.exec(line);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const rest = kv[2].trim();

    if (rest === '') {
      // A block sequence may follow on subsequent `- item` lines.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(stripQuotes(lines[j].replace(/^\s*-\s+/, '')));
        j++;
      }
      data[key] = items;
      i = items.length ? j : i + 1;
      continue;
    }

    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      data[key] = inner ? inner.split(',').map(stripQuotes).filter(Boolean) : [];
      i++;
      continue;
    }

    data[key] = stripQuotes(rest);
    i++;
  }
  return data;
}

/** Convenience: read a frontmatter field as a string[] regardless of scalar/array. */
export function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
