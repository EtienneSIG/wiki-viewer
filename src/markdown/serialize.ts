/**
 * Deterministic Markdown serialization (lossless round-trip).
 * Part of the single-source-of-truth engine (contracts/markdown-engine.md).
 *
 * Invariants: stable marker choices; identical input + options => identical
 * output; standards-only output (FR-005, SC-003, Principle I).
 */
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import type { Root } from 'mdast';

export interface SerializeOptions {
  bullet?: '-' | '*' | '+';
  emphasis?: '_' | '*';
  fence?: '`' | '~';
  /** Cosmetic normalization, OFF by default. */
  normalize?: boolean;
}

const DEFAULTS: Required<SerializeOptions> = {
  bullet: '-',
  emphasis: '*',
  fence: '`',
  normalize: false,
};

/** Serialize an edited document back to standard Markdown (lossless). */
export function serialize(tree: Root, opts: SerializeOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const processor = unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: o.bullet,
      emphasis: o.emphasis,
      strong: o.emphasis === '_' ? '_' : '*',
      fence: o.fence,
      fences: true,
      listItemIndent: 'one',
      rule: '-',
      tightDefinitions: true,
      resourceLink: false,
    });
  return processor.stringify(tree);
}
