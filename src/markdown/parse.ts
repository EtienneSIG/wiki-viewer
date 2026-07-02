/**
 * Markdown parsing — CommonMark + GitHub Flavored Markdown.
 * Part of the single-source-of-truth engine (contracts/markdown-engine.md).
 */
import { unified, type Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

/** Shared parser processor (CommonMark + GFM). */
const parser: Processor<Root> = unified()
  .use(remarkParse)
  .use(remarkGfm) as unknown as Processor<Root>;

/**
 * Parse Markdown text into a stable mdast tree (CommonMark + GFM).
 * Malformed input parses best-effort and never throws (Edge Case / Invariant 6).
 */
export function parse(markdown: string): Root {
  return parser.parse(markdown) as Root;
}
