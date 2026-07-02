/**
 * Render mdast to sanitized, safe HTML for display
 * (contracts/markdown-engine.md).
 *
 * - Untrusted HTML is sanitized via rehype-sanitize (FR-003, Principle V).
 * - With `allowRemoteContent:false` (the default), remote image resources are
 *   NOT referenced, so the renderer never triggers a network fetch without
 *   explicit consent (FR-003, SC-008).
 */
import { unified } from 'unified';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Root } from 'mdast';
import type { Root as HastRoot, Element, ElementContent } from 'hast';
import { sanitizeSchema } from './sanitize';
import { remarkWikiLink, type WikiResolveResult } from './remark-wikilink';

export interface RenderOptions {
  /** default false — gated by consent (FR-003). */
  allowRemoteContent?: boolean;
  /** add language-* hooks for client-side highlighting (FR-002). */
  highlight?: boolean;
  /** when provided, `[[wikilinks]]` are rendered as navigable anchors. */
  wikiResolve?: (target: string) => WikiResolveResult;
}

function isRemote(url: string | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

/** Walk a hast tree and neutralize remote image sources when not consented. */
function gateRemoteContent(node: HastRoot | ElementContent): void {
  if ((node as Element).type === 'element') {
    const el = node as Element;
    if (el.tagName === 'img' && isRemote(el.properties?.src as string)) {
      el.properties = el.properties ?? {};
      el.properties['data-blocked-src'] = el.properties.src as string;
      el.properties['data-remote-blocked'] = 'true';
      delete el.properties.src;
      el.properties.alt =
        `${el.properties.alt ?? ''} (remote image blocked — enable remote content to load)`.trim();
    }
  }
  const children = (node as HastRoot | Element).children;
  if (Array.isArray(children)) {
    for (const child of children) gateRemoteContent(child as ElementContent);
  }
}

/** Render mdast to sanitized, safe HTML. Synchronous and deterministic. */
export function renderHtml(tree: Root, opts: RenderOptions = {}): string {
  const allowRemoteContent = opts.allowRemoteContent ?? false;

  // `[[wikilinks]]` are an mdast→mdast rewrite; apply it directly to the tree so
  // the (typed) hast pipeline below is byte-for-byte the shared render pipeline.
  if (opts.wikiResolve) {
    remarkWikiLink({ resolve: opts.wikiResolve })(tree);
  }

  const processor = unified()
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);

  const hast = processor.runSync(tree) as HastRoot;
  if (!allowRemoteContent) gateRemoteContent(hast);
  return processor.stringify(hast);
}
