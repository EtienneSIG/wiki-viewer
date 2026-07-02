/**
 * Shared domain types for Markdit (per specs/001-markdit-core/data-model.md).
 * The Markdown text is always the single source of truth; the mdast tree is
 * transient and derived from it.
 */
import type { Root } from 'mdast';

export type DocumentState = 'Clean' | 'Dirty' | 'ConflictPending';

/** The Markdown file the user reads/edits. */
export interface MarkditDocument {
  /** In-memory session id; not persisted to disk. */
  id: string;
  /** Absolute path; `null` for an unsaved new document. */
  filePath: string | null;
  /** Derived from `filePath` (or a placeholder for new docs). */
  fileName: string;
  encoding: 'utf-8';
  /** Canonical content — the persisted bytes. Single source of truth. */
  markdown: string;
  /** Parsed AST (transient, derived from `markdown`). */
  mdast: Root | null;
  /** Unsaved-changes flag. */
  dirty: boolean;
  /** Hash of last-saved content for conflict detection. */
  lastSavedHash: string;
  /** Hash observed on disk by the watcher (conflict detection). */
  diskHash: string;
  /** Used for the > 10 MB graceful-degradation threshold. */
  sizeBytes: number;
  state: DocumentState;
}

export type FormattingActionId =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'link'
  | 'table'
  | 'codeBlock'
  | 'blockquote'
  | 'horizontalRule';

/** A visual editing command mapped deterministically to standard Markdown. */
export interface FormattingAction {
  id: FormattingActionId;
  /** Accessible, localizable label. */
  label: string;
  /** Keyboard shortcut (e.g. `Mod-b`), or null. */
  shortcut: string | null;
  /** The standard Markdown construct produced (documented mapping). */
  markdownMapping: string;
  /** `false` for constructs not representable in portable Markdown. */
  isPortable: boolean;
}

export type MarkdownElement =
  | 'heading'
  | 'paragraph'
  | 'emphasis'
  | 'strong'
  | 'strikethrough'
  | 'list'
  | 'taskList'
  | 'table'
  | 'code'
  | 'inlineCode'
  | 'blockquote'
  | 'link'
  | 'image'
  | 'thematicBreak';

export type ThemeId = 'system' | 'light' | 'dark' | 'high-contrast';

export interface PrivacySettings {
  /** Opt-in, anonymized, disableable (FR-014). Default false. */
  telemetryEnabled: boolean;
  /** Gates fetching remote images/links (FR-003). Default false. */
  allowRemoteContent: boolean;
  locale: string;
  theme: ThemeId;
}

/** Typed error returned across the IPC boundary (never thrown opaquely). */
export interface CommandError {
  code:
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'IO_ERROR'
    | 'CONFLICT'
    | 'INVALID_ARGUMENT'
    | 'CANCELLED';
  message: string;
}

/** Result wrapper for IPC calls — errors are values, not exceptions. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: CommandError };

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  telemetryEnabled: false,
  allowRemoteContent: false,
  locale: 'en',
  theme: 'system',
};

/** Documented graceful-degradation threshold (Edge Case). */
export const LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;
