/**
 * remark plugin: turn Obsidian-style `[[wikilinks]]` into real links.
 *
 * Runs as an mdast → mdast transform in the RENDER path only (never in the
 * shared `parse()` used by the editor, so raw `[[...]]` round-trips losslessly).
 *
 * Each `[[target]]`, `[[target|alias]]` or `[[target#heading|alias]]` becomes an
 * anchor whose href is `#wiki/<encoded resolved path>` and whose class is
 * `wikilink` (resolved) or `wikilink wikilink-missing` (unresolved). The reader
 * intercepts clicks on these anchors to navigate inside the wiki.
 */
import type { Root } from 'mdast';

export interface WikiResolveResult {
  /** Hash href the reader understands, e.g. `#wiki/wiki%2Fdomains%2Ffoo.md`. */
  href: string;
  /** Whether the target resolved to an existing page. */
  exists: boolean;
}

export interface WikiLinkOptions {
  resolve: (target: string) => WikiResolveResult;
}

/** Loose node shape so we can mutate mdast without fighting its unions. */
interface AnyNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  data?: Record<string, unknown>;
  children?: AnyNode[];
}

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

export function remarkWikiLink(options: WikiLinkOptions) {
  const { resolve } = options;
  return (tree: Root): void => {
    walk(tree as unknown as AnyNode, resolve);
  };
}

function walk(node: AnyNode, resolve: WikiLinkOptions['resolve']): void {
  if (!node.children || node.children.length === 0) return;
  // Never create a link inside an existing link.
  if (node.type === 'link' || node.type === 'linkReference') return;

  const next: AnyNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('[[')) {
      next.push(...splitText(child.value, resolve));
    } else {
      walk(child, resolve);
      next.push(child);
    }
  }
  node.children = next;
}

function splitText(value: string, resolve: WikiLinkOptions['resolve']): AnyNode[] {
  const out: AnyNode[] = [];
  let last = 0;
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(value)) !== null) {
    const [full, inner] = match;
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    out.push(makeLink(inner, resolve));
    last = match.index + full.length;
  }
  if (out.length === 0) return [{ type: 'text', value }];
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function makeLink(inner: string, resolve: WikiLinkOptions['resolve']): AnyNode {
  const pipe = inner.indexOf('|');
  const rawTarget = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
  // Resolve on the page name only, ignoring any `#heading` fragment.
  const target = rawTarget.split('#')[0].trim() || rawTarget;
  const label = alias || rawTarget;
  const { href, exists } = resolve(target);
  return {
    type: 'link',
    url: href,
    title: null,
    data: { hProperties: { className: exists ? ['wikilink'] : ['wikilink', 'wikilink-missing'] } },
    children: [{ type: 'text', value: label }],
  };
}
