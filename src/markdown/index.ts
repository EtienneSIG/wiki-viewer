/**
 * Markdown engine public surface — the single source of truth for parsing,
 * rendering, sanitizing, and serializing Markdown (contracts/markdown-engine.md).
 */
export { parse } from './parse';
export { serialize, type SerializeOptions } from './serialize';
export { renderHtml, type RenderOptions } from './render';
export { sanitizeSchema } from './sanitize';
export { highlightCode } from './highlight';
export {
  mdastToProseMirror,
  proseMirrorToMdast,
  type ProseMirrorDoc,
  type ProseMirrorNode,
} from './tiptap-bridge';
