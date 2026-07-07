import type { GraphLink, GraphNode, WikiFile, WikiGraph, WikiModel } from './wiki';

/**
 * Contacts graph — a second, purpose-built graph that shows ONLY the customer
 * contacts (not wiki pages). It is derived from the per-account contact
 * directory pages (`contacts-alstom`, `contacts-michelin`, …): each page becomes
 * a central account hub node, and every contact listed on it becomes a leaf node
 * linked to that hub. A legacy single-page directory layout is still supported
 * as a fallback.
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

/** Slug of the canonical contacts directory page (now an index hub). */
const CONTACTS_SLUG = 'customer-contacts-directory';

/** Slug prefix of the per-account contact pages (contacts-alstom, …). */
const PER_ACCOUNT_PREFIX = 'contacts-';

/** Slug of the hierarchy/influence map page (contact-to-contact edges). */
const INFLUENCE_SLUG = 'contact-influence-map';

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

/**
 * Per-account contact directory pages (one per client, e.g. `contacts-alstom`,
 * `contacts-michelin`). These replaced the single all-accounts table page; the
 * old `customer-contacts-directory` is now an index hub with no contact tables.
 */
export function findPerAccountContactFiles(model: WikiModel): WikiFile[] {
  return model.files.filter(
    (f) =>
      f.slug.startsWith(PER_ACCOUNT_PREFIX) &&
      f.tags.includes('contacts') &&
      f.tags.includes('directory'),
  );
}

/** Human label for an account hub, from the page title (before an em dash). */
function accountLabelFromFile(file: WikiFile, slug: string): string {
  const first = (file.title ?? '').split(/\s+[—–-]\s+/)[0].trim();
  if (first && !/directory|annuaire/i.test(first)) return first;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
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
 * Build the contacts graph. Prefers the per-account directory pages
 * (`contacts-<slug>.md`); each page becomes ONE account hub whose contacts —
 * across every table on the page (e.g. Michelin + its Euromaster subsidiary, or
 * the three AXA sub-orgs) — attach as leaves. Falls back to the legacy
 * single-page `## Account` layout when no per-account pages are present. Safe to
 * call before content is loaded (returns an empty graph in that case).
 */
export function buildContactsGraph(model: WikiModel): ContactsGraphResult {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const openTargets = new Map<string, string>();

  const perAccount = findPerAccountContactFiles(model);
  let contactCount = 0;
  let seq = 0;

  if (perAccount.length > 0) {
    for (const file of perAccount) {
      if (!file.content) continue;
      const slug = file.slug.slice(PER_ACCOUNT_PREFIX.length);
      if (!slug || nodes.some((n) => n.id === `account:${slug}`)) continue;

      const id = `account:${slug}`;
      const name = accountLabelFromFile(file, slug);
      nodes.push({ id, label: name, group: name, degree: 0, clients: [slug] });
      // Clicking a hub opens the client page if it exists, else the page itself.
      openTargets.set(id, clientPagePath(model, slug) ?? file.path);

      const before = seq;
      seq = addContactRows(
        file.content.split(/\r?\n/),
        { name, slug, id },
        file.path,
        nodes,
        links,
        openTargets,
        seq,
      );
      const added = seq - before;
      contactCount += added;
      const hub = nodes.find((n) => n.id === id);
      if (hub) hub.degree = added;
    }
  } else {
    contactCount = buildFromDirectoryPage(model, nodes, links, openTargets);
  }

  // Enrich with contact-to-contact influence edges parsed from the influence
  // map page (best-effort; a no-op when the page is absent or not yet loaded).
  addInfluenceLinks(model, nodes, links);

  return { graph: { nodes, links }, openTargets, contactCount };
}

/**
 * Append every contact row found in `lines` as a leaf of `account`. Contact
 * tables are detected by a header row containing a "Nom"/"Name" column; a table
 * ends at the first non-table line, so several tables on one page (e.g.
 * Michelin + Euromaster, or the three AXA sub-orgs) are all parsed. Returns the
 * next free sequence number.
 */
function addContactRows(
  lines: string[],
  account: { name: string; slug: string; id: string },
  leafPath: string,
  nodes: GraphNode[],
  links: GraphLink[],
  openTargets: Map<string, string>,
  seqStart: number,
): number {
  let seq = seqStart;
  let sawHeader = false;

  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      sawHeader = false; // any non-table line closes the current table.
      continue;
    }
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;

    if (!sawHeader) {
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.some((c) => c === 'nom' || c === 'name')) sawHeader = true;
      continue;
    }

    // Data row: col 0 = name, col 2 = title (when present).
    const name = cleanCell(cells[0] ?? '');
    if (!name) continue;
    const title = cleanCell(cells[2] ?? '');

    const id = `contact:${account.slug}:${seq++}`;
    nodes.push({
      id,
      label: name,
      group: account.name,
      degree: 1,
      clients: [account.slug],
      title: title || undefined,
    });
    links.push({ source: id, target: account.id, kind: 'member' });
    openTargets.set(id, leafPath);
  }

  return seq;
}

/**
 * Legacy fallback: parse a single all-accounts directory page whose `## Account`
 * headings each introduce a contact table. Retained for wikis that still use the
 * old monolithic `customer-contacts-directory` layout.
 */
function buildFromDirectoryPage(
  model: WikiModel,
  nodes: GraphNode[],
  links: GraphLink[],
  openTargets: Map<string, string>,
): number {
  const file = findContactsFile(model);
  if (!file || !file.content) return 0;

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
    nodes.push({
      id,
      label: name,
      group: account.name,
      degree: 1,
      clients: [account.slug],
      title: title || undefined,
    });
    links.push({ source: id, target: account.id, kind: 'member' });
    openTargets.set(id, contactsPath);
    account.count += 1;
    contactCount += 1;
  }
  flushAccountDegree();

  return contactCount;
}

// ── Influence map (contact ↔ contact edges) ─────────────────────────────────

/** A contact node indexed for fuzzy name matching against the influence map. */
interface ContactIndexEntry {
  id: string;
  /** Account slug this contact belongs to (e.g. `stellantis`). */
  slug: string;
  /** Normalized full name (accent-free, lowercased, single-spaced). */
  full: string;
  /** Tokens of {@link full}. */
  tokens: string[];
  /** Last token — the surname in most cases. */
  last: string;
  /** Last two tokens joined — handles compound surnames ("el khoury"). */
  last2: string;
}

/** Accent-fold + lowercase + collapse to single spaces (keeps letters/digits). */
function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Locate the influence map page (by slug, then by `influence` tag). */
function findInfluenceFile(model: WikiModel): WikiFile | null {
  const bySlug = model.files.find((f) => f.slug === INFLUENCE_SLUG);
  if (bySlug) return bySlug;
  return model.files.find((f) => f.tags.includes('influence') && f.tags.includes('contacts')) ?? null;
}

/** Build a per-account index of contact nodes for name matching. */
function indexContacts(nodes: GraphNode[]): Map<string, ContactIndexEntry[]> {
  const byAccount = new Map<string, ContactIndexEntry[]>();
  for (const n of nodes) {
    if (!n.id.startsWith('contact:')) continue;
    const slug = n.clients[0];
    if (!slug) continue;
    const full = normalizeName(n.label);
    const tokens = full.split(' ').filter(Boolean);
    if (tokens.length === 0) continue;
    const last = tokens[tokens.length - 1];
    const last2 = tokens.length >= 2 ? `${tokens[tokens.length - 2]} ${last}` : last;
    const entry: ContactIndexEntry = { id: n.id, slug, full, tokens, last, last2 };
    const bucket = byAccount.get(slug);
    if (bucket) bucket.push(entry);
    else byAccount.set(slug, [entry]);
  }
  return byAccount;
}

/** Score how well a contact matches a (possibly partial) name from the map. */
function matchScore(entry: ContactIndexEntry, qNorm: string, qTokens: string[], qLast: string): number {
  if (entry.full === qNorm) return 100;
  if (entry.last2 === qNorm) return 90;
  if (qTokens.length >= 2 && entry.full.includes(qNorm)) return 80;
  if (entry.last === qLast) return 70;
  if (entry.tokens.includes(qLast)) return 50;
  return 0;
}

/**
 * Resolve a name reference from the influence map to a contact node id, scoped
 * to the accounts of the current section. Returns null when there is no match
 * or the match is ambiguous (two contacts tie on the best score).
 */
function resolveContact(
  name: string,
  slugs: string[],
  index: Map<string, ContactIndexEntry[]>,
): string | null {
  const qNorm = normalizeName(name);
  if (!qNorm) return null;
  const qTokens = qNorm.split(' ').filter(Boolean);
  const qLast = qTokens[qTokens.length - 1];

  let best: ContactIndexEntry | null = null;
  let bestScore = 0;
  let tie = false;
  for (const slug of slugs) {
    for (const entry of index.get(slug) ?? []) {
      const score = matchScore(entry, qNorm, qTokens, qLast);
      if (score === 0) continue;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
        tie = false;
      } else if (score === bestScore && entry.id !== best?.id) {
        tie = true;
      }
    }
  }
  return best && !tie ? best.id : null;
}

/** Which account slugs a section heading refers to (heading may span several). */
function sectionSlugs(heading: string, accountSlugs: Set<string>): string[] {
  const norm = normalizeName(heading);
  return [...accountSlugs].filter((slug) => norm.includes(slug));
}

/**
 * Extract the ordered name chains from a cluster's "central link" cell, e.g.
 * `Dessables ↔ Fernandez ↔ Renee` or `Penet ↔ Mrad · Negi ↔ Arora`
 * (independent chains separated by `·`), plus any `(+ Brown, Dillon)` extras
 * that attach to the preceding chain's last member.
 */
function parseChains(cell: string): { chains: string[][]; extras: string[] } {
  const extras: string[] = [];
  // Pull out parenthetical additions like "(+ Brown, Dillon)".
  const main = cell.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    for (const part of String(inner).replace(/^\s*\+/, '').split(/[,;]/)) {
      const name = part.trim();
      if (name) extras.push(name);
    }
    return '';
  });
  const chains = main
    .split(/[·•]/)
    .map((seg) =>
      seg
        .split(/[↔→←⇄⇔]/)
        .map((s) => s.replace(/[*_`]/g, '').trim())
        .filter(Boolean),
    )
    .filter((chain) => chain.length > 0);
  return { chains, extras };
}

/**
 * Parse the influence map's "clusters" tables and add contact ↔ contact
 * influence links to the graph, bumping the degree of connected contacts so the
 * most influential ones render larger. Silently does nothing when the page is
 * missing, not yet loaded, or contains no recognizable cluster table.
 */
function addInfluenceLinks(model: WikiModel, nodes: GraphNode[], links: GraphLink[]): void {
  const file = findInfluenceFile(model);
  if (!file || !file.content) return;

  const index = indexContacts(nodes);
  if (index.size === 0) return;
  const accountSlugs = new Set(index.keys());
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Dedupe against structural (member) links and repeated influence edges.
  const seen = new Set<string>();
  for (const l of links) seen.add(l.source < l.target ? `${l.source}|${l.target}` : `${l.target}|${l.source}`);

  const addEdge = (a: string | null, b: string | null): void => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b, kind: 'influence' });
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    if (na) na.degree += 1;
    if (nb) nb.degree += 1;
  };

  const lines = file.content.split(/\r?\n/);
  let slugs: string[] = [];
  let linkColumn = -1; // index of the "Lien central" column, -1 when not in a cluster table.

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      slugs = sectionSlugs(heading[1], accountSlugs);
      linkColumn = -1;
      continue;
    }
    if (!line.trim().startsWith('|')) {
      linkColumn = -1; // any non-table line ends the current table.
      continue;
    }
    if (slugs.length === 0) continue;

    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;

    if (linkColumn === -1) {
      // Header row: locate the central-link column to start parsing a cluster.
      const idx = cells.findIndex((c) => normalizeName(c) === 'lien central');
      if (idx !== -1) linkColumn = idx;
      continue;
    }

    const cell = cells[linkColumn];
    if (!cell) continue;
    const { chains, extras } = parseChains(cell);
    let anchor: string | null = null;
    for (const chain of chains) {
      const ids = chain.map((name) => resolveContact(name, slugs, index));
      for (let i = 0; i < ids.length - 1; i++) addEdge(ids[i], ids[i + 1]);
      const resolved = ids.filter(Boolean).slice(-1)[0] ?? null;
      if (resolved) anchor = resolved;
    }
    // Extras (e.g. "(+ Brown, Dillon)") attach to the last resolved member.
    if (anchor) for (const ex of extras) addEdge(anchor, resolveContact(ex, slugs, index));
  }
}
