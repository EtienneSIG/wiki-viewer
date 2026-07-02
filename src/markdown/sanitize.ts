/**
 * Sanitization schema for rendered HTML (FR-003, Principle V).
 * Strips scripts, event handlers, and dangerous URL protocols via
 * rehype-sanitize. Built on top of the GitHub-like default schema.
 */
import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * A conservative schema: GitHub-flavored defaults, with explicit protocol
 * allow-lists. `javascript:` and other dangerous protocols are excluded.
 */
export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel', '#'],
    src: ['http', 'https', 'data'],
  },
  attributes: {
    ...defaultSchema.attributes,
    // Allow language class on code blocks for syntax-highlight styling.
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']],
    // Wiki links carry a class (wikilink / wikilink-missing) for styling and a
    // hash href (#wiki/<encoded path>) that the reader intercepts to navigate.
    a: [...(defaultSchema.attributes?.a ?? []), ['className']],
    // Task-list checkboxes (GFM).
    input: [...(defaultSchema.attributes?.input ?? []), 'checked', 'disabled', 'type'],
  },
  // Inline/raw HTML event handlers and <script>/<style> are dropped because they
  // are not present in the allow-list above (rehype-sanitize default behavior).
};
