/**
 * TipTap (ProseMirror) ⇄ mdast bridge (contracts/markdown-engine.md).
 *
 * The remark/rehype engine remains the single source of truth: the editor's
 * ProseMirror document is converted to mdast and serialized through
 * `serialize()`, never persisted as a proprietary format (Principle I/II).
 *
 * This bridge covers the portable CommonMark + GFM constructs that the toolbar
 * exposes. Non-portable constructs are isolated and reversible (T044): they are
 * carried as marks that simply drop back to their text content on serialization.
 */
import type {
  Root,
  RootContent,
  PhrasingContent,
  Heading,
  List,
  ListItem,
  Paragraph,
  BlockContent,
  DefinitionContent,
  Table,
  TableRow,
  TableCell,
} from 'mdast';

/** Minimal ProseMirror JSON node shape (schema-agnostic). */
export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

// --- mdast -> ProseMirror --------------------------------------------------

function phrasingToPm(nodes: PhrasingContent[]): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push({ type: 'text', text: node.value });
        break;
      case 'strong':
        out.push(...wrapMark(phrasingToPm(node.children), 'bold'));
        break;
      case 'emphasis':
        out.push(...wrapMark(phrasingToPm(node.children), 'italic'));
        break;
      case 'delete':
        out.push(...wrapMark(phrasingToPm(node.children), 'strike'));
        break;
      case 'inlineCode':
        out.push({ type: 'text', text: node.value, marks: [{ type: 'code' }] });
        break;
      case 'image':
        out.push({
          type: 'image',
          attrs: { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
        });
        break;
      case 'link':
        out.push(
          ...wrapMark(phrasingToPm(node.children), 'link', { href: node.url, title: node.title }),
        );
        break;
      case 'break':
        out.push({ type: 'hardBreak' });
        break;
      default:
        // Best-effort: render unknown phrasing as its text if present.
        if ('value' in node && typeof node.value === 'string') {
          out.push({ type: 'text', text: node.value });
        }
    }
  }
  return out;
}

function wrapMark(
  nodes: ProseMirrorNode[],
  markType: string,
  attrs?: Record<string, unknown>,
): ProseMirrorNode[] {
  return nodes.map((n) =>
    n.type === 'text'
      ? { ...n, marks: [...(n.marks ?? []), { type: markType, ...(attrs ? { attrs } : {}) }] }
      : n,
  );
}

function blockToPm(node: RootContent): ProseMirrorNode | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', content: phrasingToPm(node.children) };
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: node.depth },
        content: phrasingToPm(node.children),
      };
    case 'blockquote':
      return { type: 'blockquote', content: childrenToPm(node.children) };
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: node.lang ?? null },
        content: [{ type: 'text', text: node.value }],
      };
    case 'thematicBreak':
      return { type: 'horizontalRule' };
    case 'list':
      return listToPm(node);
    case 'table':
      return tableToPm(node);
    default:
      return null;
  }
}

function tableToPm(node: Table): ProseMirrorNode {
  const rows = node.children.map((row, rowIndex) => ({
    type: 'tableRow',
    content: row.children.map((cell) => ({
      type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
      content: [{ type: 'paragraph', content: phrasingToPm(cell.children) }],
    })),
  }));
  return { type: 'table', content: rows };
}

function listToPm(node: List): ProseMirrorNode {
  // GFM task lists (items carrying a checkbox) map to a TipTap taskList so the
  // checkboxes stay editable and round-trip; ordinary lists keep their type.
  const isTaskList = node.children.some((item) => item.checked != null);
  if (isTaskList) {
    return {
      type: 'taskList',
      content: node.children.map((item) => ({
        type: 'taskItem',
        attrs: { checked: Boolean(item.checked) },
        content: childrenToPm(item.children),
      })),
    };
  }
  return {
    type: node.ordered ? 'orderedList' : 'bulletList',
    attrs: node.start != null ? { start: node.start } : undefined,
    content: node.children.map((item) => listItemToPm(item)),
  };
}

function listItemToPm(item: ListItem): ProseMirrorNode {
  return {
    type: item.checked == null ? 'listItem' : 'taskItem',
    attrs: item.checked == null ? undefined : { checked: item.checked },
    content: childrenToPm(item.children),
  };
}

function childrenToPm(children: RootContent[]): ProseMirrorNode[] {
  return children.map(blockToPm).filter((n): n is ProseMirrorNode => n !== null);
}

/** Convert an mdast tree to a ProseMirror/TipTap document. */
export function mdastToProseMirror(tree: Root): ProseMirrorDoc {
  return { type: 'doc', content: childrenToPm(tree.children) };
}

// --- ProseMirror -> mdast --------------------------------------------------

function pmInlineToMdast(nodes: ProseMirrorNode[] = []): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out.push({ type: 'break' });
      continue;
    }
    if (node.type === 'image') {
      out.push({
        type: 'image',
        url: String(node.attrs?.src ?? ''),
        alt: (node.attrs?.alt as string) ?? null,
        title: (node.attrs?.title as string) ?? null,
      });
      continue;
    }
    if (node.type !== 'text' || node.text == null) continue;
    let current: PhrasingContent = { type: 'text', value: node.text };
    const marks = node.marks ?? [];
    if (marks.some((m) => m.type === 'code')) {
      current = { type: 'inlineCode', value: node.text };
    }
    for (const mark of marks) {
      if (mark.type === 'bold') current = { type: 'strong', children: [current] };
      else if (mark.type === 'italic') current = { type: 'emphasis', children: [current] };
      else if (mark.type === 'strike') current = { type: 'delete', children: [current] };
      else if (mark.type === 'link')
        current = {
          type: 'link',
          url: String(mark.attrs?.href ?? ''),
          title: (mark.attrs?.title as string) ?? null,
          children: [current],
        };
    }
    out.push(current);
  }
  return out;
}

function pmBlockToMdast(node: ProseMirrorNode): RootContent | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', children: pmInlineToMdast(node.content) } as Paragraph;
    case 'heading':
      return {
        type: 'heading',
        depth: (node.attrs?.level as Heading['depth']) ?? 1,
        children: pmInlineToMdast(node.content),
      } as Heading;
    case 'blockquote':
      return {
        type: 'blockquote',
        children: pmChildrenToMdast(node.content) as (BlockContent | DefinitionContent)[],
      };
    case 'codeBlock':
      return {
        type: 'code',
        lang: (node.attrs?.language as string) ?? null,
        value: node.content?.map((c) => c.text ?? '').join('') ?? '',
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'bulletList':
    case 'orderedList':
      return {
        type: 'list',
        ordered: node.type === 'orderedList',
        start: (node.attrs?.start as number) ?? null,
        spread: false,
        children: (node.content ?? []).map(pmListItemToMdast),
      } as List;
    case 'taskList':
      return {
        type: 'list',
        ordered: false,
        start: null,
        spread: false,
        children: (node.content ?? []).map(pmListItemToMdast),
      } as List;
    case 'table':
      return pmTableToMdast(node);
    default:
      return null;
  }
}

function pmTableToMdast(node: ProseMirrorNode): Table {
  const rows = (node.content ?? []).map((row) => ({
    type: 'tableRow',
    children: (row.content ?? []).map((cell) => {
      // A cell holds block content; tables carry only inline content, so pull
      // the phrasing out of the cell's first paragraph.
      const firstBlock = cell.content?.[0];
      return {
        type: 'tableCell',
        children: pmInlineToMdast(firstBlock?.content),
      } as TableCell;
    }),
  })) as TableRow[];
  const columnCount = rows[0]?.children.length ?? 0;
  return { type: 'table', align: new Array(columnCount).fill(null), children: rows };
}

function pmListItemToMdast(item: ProseMirrorNode): ListItem {
  return {
    type: 'listItem',
    checked: item.type === 'taskItem' ? Boolean(item.attrs?.checked) : null,
    spread: false,
    children: pmChildrenToMdast(item.content) as (BlockContent | DefinitionContent)[],
  };
}

function pmChildrenToMdast(content: ProseMirrorNode[] = []): RootContent[] {
  return content.map(pmBlockToMdast).filter((n): n is RootContent => n !== null);
}

/** Convert a ProseMirror/TipTap document back to mdast for serialization. */
export function proseMirrorToMdast(doc: ProseMirrorDoc): Root {
  return { type: 'root', children: pmChildrenToMdast(doc.content) };
}
