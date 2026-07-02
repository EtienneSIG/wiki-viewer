/**
 * Formatting action catalog (FR-004, data-model.md §2). Every portable action
 * maps deterministically to a standard CommonMark/GFM construct (Principle II).
 */
import type { FormattingAction, FormattingActionId } from '../../lib/types';

export const FORMATTING_ACTIONS: Record<FormattingActionId, FormattingAction> = {
  bold: {
    id: 'bold',
    label: 'Bold',
    shortcut: 'Mod-b',
    markdownMapping: '**text**',
    isPortable: true,
  },
  italic: {
    id: 'italic',
    label: 'Italic',
    shortcut: 'Mod-i',
    markdownMapping: '*text*',
    isPortable: true,
  },
  strikethrough: {
    id: 'strikethrough',
    label: 'Strikethrough',
    shortcut: 'Mod-Shift-s',
    markdownMapping: '~~text~~',
    isPortable: true,
  },
  inlineCode: {
    id: 'inlineCode',
    label: 'Inline code',
    shortcut: 'Mod-e',
    markdownMapping: '`code`',
    isPortable: true,
  },
  heading: {
    id: 'heading',
    label: 'Heading',
    shortcut: 'Mod-Alt-1',
    markdownMapping: '# Heading',
    isPortable: true,
  },
  bulletList: {
    id: 'bulletList',
    label: 'Bulleted list',
    shortcut: 'Mod-Shift-8',
    markdownMapping: '- item',
    isPortable: true,
  },
  orderedList: {
    id: 'orderedList',
    label: 'Numbered list',
    shortcut: 'Mod-Shift-7',
    markdownMapping: '1. item',
    isPortable: true,
  },
  taskList: {
    id: 'taskList',
    label: 'Task list',
    shortcut: 'Mod-Shift-9',
    markdownMapping: '- [ ] item',
    isPortable: true,
  },
  link: {
    id: 'link',
    label: 'Link',
    shortcut: 'Mod-k',
    markdownMapping: '[text](url)',
    isPortable: true,
  },
  table: {
    id: 'table',
    label: 'Table',
    shortcut: null,
    markdownMapping: '| a | b |\n| - | - |',
    isPortable: true,
  },
  codeBlock: {
    id: 'codeBlock',
    label: 'Code block',
    shortcut: 'Mod-Alt-c',
    markdownMapping: '```lang\ncode\n```',
    isPortable: true,
  },
  blockquote: {
    id: 'blockquote',
    label: 'Quote',
    shortcut: 'Mod-Shift-b',
    markdownMapping: '> quote',
    isPortable: true,
  },
  horizontalRule: {
    id: 'horizontalRule',
    label: 'Divider',
    shortcut: null,
    markdownMapping: '---',
    isPortable: true,
  },
};

export const FORMATTING_ACTION_LIST: FormattingAction[] = Object.values(FORMATTING_ACTIONS);
