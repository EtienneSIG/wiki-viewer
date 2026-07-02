import type { GraphLink, GraphNode, WikiFile, WikiGraph, WikiModel } from './wiki';

/**
 * Contacts graph — a second, purpose-built graph that shows ONLY the customer
 * contacts (not wiki pages). It is derived from the "Customer Contacts
 * Directory" page: each account (Alstom, Michelin, …) becomes a central hub
 * node, and every contact under it becomes a leaf node linked to that hub.
 *
 * The result reuses {@link WikiGraph} so the existing force-directed GraphView
 * can render it unchanged. Node ids are synthetic (`account:*` / `contact:*`),
 * so {@link ContactsGraphResult.openTargets} maps them back to a real wiki path
 * to open on click.
 */
export interface ContactsGraphResult {
  graph: WikiGraph;
  /** Synthetic node id → wiki file path to open when the node is clicked. */
  openTargets: Map<string, string>;
  /** Total contacts parsed (0 ⇒ nothing to show / not indexed yet). */
  contactCount: number;
}

/** Slug of the canonical contacts directory page. */
const CONTACTS_SLUG = 'customer-contacts-directory';

/** Section headings that are not account tables. */
const NON_ACCOUNT_HEADINGS = new Set(['summary', 'décompte', 'decompte', 'related', 'sources']);

/** Locate the contacts directory page in the model (by slug, then by tags). */
export function findContactsFile(model: WikiModel): WikiFile | null {
  const bySlug = model.files.find((f) => f.slug === CONTACTS_SLUG);
  if (bySlug) return bySlug;
  return (
    model.files.find((f) => f.tags.includes('contacts') && f.tags.includes('directory')) ?? null
  );
}

/** True when the page exists in the model (used to link account hubs to their client page). */
function clientPagePath(model: WikiModel, slug: string): string | null {
  return model.files.find((f) => f.slug === slug)?.path ?? null;
}

/** Strip Markdown emphasis / placeholders from a table cell; '' when empty. */
function cleanCell(raw: string): string {
  let s = raw.trim();
  // Drop wrapping <...> (emails), *...* / _..._ emphasis, and links.
  s = s.replace(/^<(.+)>$/, '$1');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  s = s.replace(/_(.+?)_/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/`/g, '').trim();
  // Strip a leading em/en dash placeholder (e.g. "— (prestataire ext.)").
  s = s.replace(/^[—–-]\s*/, '').trim();
  // Nothing meaningful, or only a parenthetical note ⇒ no value.
  if (!s || s === '—' || s === '-' || s === '–' || /^\(.*\)$/.test(s)) return '';
  return s;
}

/** Split a Markdown table row into trimmed cells (drops leading/trailing pipes). */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

/** A separator row is only dashes/colons/spaces between the pipes. */
function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
}

/**
 * Parse the contacts directory Markdown into a graph. Safe to call before the
 * page content is loaded — returns an empty graph in that case.
 */
export function buildContactsGraph(model: WikiModel): ContactsGraphResult {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const openTargets = new Map<string, string>();

  const file = findContactsFile(model);
  if (!file || !file.content) {
    return { graph: { nodes, links }, openTargets, contactCount: 0 };
  }

  const contactsPath = file.path;
  const lines = file.content.split(/\r?\n/);

  let account: { name: string; slug: string; id: string; count: number } | null = null;
  let sawHeader = false;
  let contactCount = 0;
  let seq = 0;

  const flushAccountDegree = (): void => {
    if (!account) return;
    const hub = nodes.find((n) => n.id === account!.id);
    if (hub) hub.degree = account.count;
  };

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      // Close the previous account's hub degree before switching.
      flushAccountDegree();

      // Account name is the text before an em dash / hyphen separator.
      const headingText = heading[1];
      const namePart = headingText.split(/\s+[—–-]\s+/)[0].trim();
      const key = namePart.toLowerCase();
      if (NON_ACCOUNT_HEADINGS.has(key) || !namePart) {
        account = null;
        sawHeader = false;
        continue;
      }
      const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `account:${slug}`;
      account = { name: namePart, slug, id, count: 0 };
      sawHeader = false;
      nodes.push({ id, label: namePart, group: namePart, degree: 0, clients: [slug] });
      // Clicking a hub opens the client page if it exists, else the directory.
      openTargets.set(id, clientPagePath(model, slug) ?? contactsPath);
      continue;
    }

    if (!account) continue;
    if (!line.trim().startsWith('|')) continue;

    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;

    // The header row establishes that this is a contact table.
    const lower = cells.map((c) => c.toLowerCase());
    if (!sawHeader) {
      if (lower.some((c) => c === 'nom' || c === 'name')) sawHeader = true;
      continue;
    }

    // Data row: col 0 = name, col 2 = title (when present).
    const name = cleanCell(cells[0] ?? '');
    if (!name) continue;
    const title = cleanCell(cells[2] ?? '');

    const id = `contact:${account.slug}:${seq++}`;
    const label = name;
    nodes.push({
      id,
      label,
      group: account.name,
      degree: 1,
      clients: [account.slug],
      title: title || undefined,
    });
    links.push({ source: id, target: account.id });
    openTargets.set(id, contactsPath);
    account.count += 1;
    contactCount += 1;
  }
  flushAccountDegree();

  return { graph: { nodes, links }, openTargets, contactCount };
}
