/**
 * Wiki model: scan an opened folder of Markdown files and derive everything the
 * UI needs — the file tree, the link graph (Obsidian-style), backlinks, and a
 * `[[wikilink]]` resolver shared with the reader.
 */
import { splitFrontmatter, asList } from './frontmatter';
import type { WikiResolveResult } from '../markdown/remark-wikilink';

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;
const EXCALIDRAW_EXT = /\.excalidraw$/i;

/** Kind of a scanned file. Markdown drives the graph; excalidraw is a diagram asset. */
export type WikiFileKind = 'markdown' | 'excalidraw';

/**
 * Directories that never contain wiki content but can hold hundreds of
 * Markdown files (dependencies, build output). Scanning them — especially on
 * cloud-synced folders — is what made "open a wiki" hang. Dot-prefixed dirs
 * (.git, .obsidian, …) are skipped separately.
 */
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'target',
  '.next',
  '.turbo',
  '.cache',
]);

export interface WikiFile {
  /** Path relative to the opened root, forward slashes (e.g. `wiki/domains/foo.md`). */
  path: string;
  /** Basename with extension (e.g. `foo.md`). */
  name: string;
  /** Basename without extension (e.g. `foo`). */
  slug: string;
  /** markdown page, or excalidraw diagram asset. */
  kind: WikiFileKind;
  /** Display title — frontmatter `title` or the slug. */
  title: string;
  /** Frontmatter `category`, else the immediate parent folder. Drives graph color. */
  category: string;
  tags: string[];
  /** Grouping key for the graph (same as `category`). */
  group: string;
  /** Full raw Markdown (including frontmatter). */
  content: string;
  handle: FileSystemFileHandle;
  /** Resolved outgoing links (paths of existing pages). */
  outLinks: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  degree: number;
  /** Client slugs this page is associated with (for the graph client filter). */
  clients: string[];
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface WikiGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  /** For file nodes: the underlying file kind (drives the tree icon). */
  fileType?: WikiFileKind;
  children?: TreeNode[];
}

export interface WikiModel {
  rootName: string;
  files: WikiFile[];
  byPath: Map<string, WikiFile>;
  tree: TreeNode[];
  graph: WikiGraph;
  /** path → paths of pages that link to it. */
  backlinks: Map<string, string[]>;
  /** Resolve a `[[target]]` to a navigable href for the reader. */
  resolve: (target: string) => WikiResolveResult;
}

interface RawFile {
  handle: FileSystemFileHandle;
  path: string;
  name: string;
}

// ── Scanning ────────────────────────────────────────────────────────────────

async function collectFiles(
  dir: FileSystemDirectoryHandle,
  base: string,
  acc: RawFile[],
): Promise<void> {
  let iterator: AsyncIterable<FileSystemHandle>;
  try {
    iterator = dir.values();
  } catch (err) {
    // A cloud-only (OneDrive Files On-Demand) directory can refuse enumeration.
    // Don't let one bad folder abort the whole scan — skip it and continue.
    console.warn(`[wiki] cannot enumerate "${base || dir.name}":`, err);
    return;
  }
  try {
    for await (const entry of iterator) {
      if (entry.name.startsWith('.')) continue; // skip .obsidian, .git, …
      if (entry.kind === 'directory' && IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
      const path = base ? `${base}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await collectFiles(entry as FileSystemDirectoryHandle, path, acc);
      } else if (MD_EXT.test(entry.name) || EXCALIDRAW_EXT.test(entry.name)) {
        acc.push({ handle: entry as FileSystemFileHandle, path, name: entry.name });
      }
    }
  } catch (err) {
    // Iteration failed partway (e.g. a placeholder hydration error). Keep
    // whatever we already collected rather than throwing the whole scan away.
    console.warn(`[wiki] enumeration of "${base || dir.name}" stopped early:`, err);
  }
}

/** Read a folder into a full wiki model (single blocking pass). */
export async function scanWiki(dir: FileSystemDirectoryHandle): Promise<WikiModel> {
  const { rootName, entries } = await scanEntries(dir);
  const files = await readEntries(entries);
  return buildModel(rootName, files);
}

/** A discovered Markdown file, before its content is read. */
export interface WikiEntry {
  handle: FileSystemFileHandle;
  path: string;
  name: string;
}

/**
 * Phase 1 (fast): enumerate Markdown files WITHOUT reading their contents.
 * This is cheap even on cloud-synced (OneDrive) folders because it never
 * hydrates file bodies — only directory metadata is touched.
 */
export async function scanEntries(
  dir: FileSystemDirectoryHandle,
): Promise<{ rootName: string; entries: WikiEntry[] }> {
  const raw: RawFile[] = [];
  await collectFiles(dir, '', raw);
  return { rootName: dir.name, entries: raw };
}

/**
 * Build a lightweight model from entries alone (empty content). The file tree
 * and the slug/title/path `[[wikilink]]` resolver work immediately; the graph
 * and backlinks stay empty until {@link readEntries} + {@link buildModel} run.
 */
export function buildLightModel(rootName: string, entries: WikiEntry[]): WikiModel {
  return buildModel(rootName, entries.map((e) => buildFile(e, '')));
}

/**
 * Phase 2 (background): read entry contents with bounded concurrency to avoid
 * thrashing cloud-synced folders. Returns full {@link WikiFile}s ready for
 * {@link buildModel}.
 */
export async function readEntries(
  entries: WikiEntry[],
  concurrency = 12,
): Promise<WikiFile[]> {
  const files = new Array<WikiFile>(entries.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= entries.length) return;
      const e = entries[i];
      let content = '';
      try {
        content = await (await e.handle.getFile()).text();
      } catch {
        content = '';
      }
      files[i] = buildFile(e, content);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, entries.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return files;
}

function buildFile(rf: RawFile, content: string): WikiFile {
  const isExcalidraw = EXCALIDRAW_EXT.test(rf.name);
  const segments = rf.path.split('/');
  const parent = segments.length > 1 ? segments[segments.length - 2] : '(racine)';

  if (isExcalidraw) {
    const slug = rf.name.replace(EXCALIDRAW_EXT, '');
    return {
      path: rf.path,
      name: rf.name,
      slug,
      kind: 'excalidraw',
      title: slug,
      category: parent,
      tags: [],
      group: parent,
      content,
      handle: rf.handle,
      outLinks: [],
    };
  }

  const { data } = splitFrontmatter(content);
  const slug = rf.name.replace(MD_EXT, '');
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : slug;
  const category =
    typeof data.category === 'string' && data.category.trim() ? data.category.trim() : parent;
  return {
    path: rf.path,
    name: rf.name,
    slug,
    kind: 'markdown',
    title,
    category,
    tags: asList(data.tags),
    group: category,
    content,
    handle: rf.handle,
    outLinks: [],
  };
}

// ── Model assembly (also used to rebuild after an edit) ───────────────────────

export function buildModel(rootName: string, files: WikiFile[]): WikiModel {
  const byPath = new Map(files.map((f) => [f.path, f]));

  // Name index for [[wikilink]] resolution (first match wins). Only Markdown
  // pages are link targets; excalidraw diagrams are openable assets, not pages.
  const index = new Map<string, string>();
  const addKey = (key: string, path: string): void => {
    const k = normalizeKey(key);
    if (k && !index.has(k)) index.set(k, path);
  };
  for (const f of files) {
    if (f.kind !== 'markdown') continue;
    addKey(f.slug, f.path);
    addKey(f.title, f.path);
    addKey(f.path.replace(MD_EXT, ''), f.path);
  }

  const resolveTarget = (target: string): string | null => {
    const direct = index.get(normalizeKey(target));
    if (direct) return direct;
    const base = target.replace(/\\/g, '/').split('/').pop() ?? target;
    return index.get(normalizeKey(base)) ?? null;
  };

  // Outgoing links per file (deduped, existing pages only). Excalidraw assets
  // don't participate in the link graph.
  for (const f of files) {
    if (f.kind !== 'markdown') {
      f.outLinks = [];
      continue;
    }
    const set = new Set<string>();
    for (const target of extractTargets(f)) {
      const path = resolveTarget(target);
      if (path && path !== f.path) set.add(path);
    }
    f.outLinks = [...set];
  }

  // Backlinks.
  const backlinks = new Map<string, string[]>();
  for (const f of files) {
    for (const target of f.outLinks) {
      const arr = backlinks.get(target) ?? [];
      arr.push(f.path);
      backlinks.set(target, arr);
    }
  }

  // Graph (undirected, deduped).
  const degree = new Map<string, number>();
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const target of f.outLinks) {
      const key = `${f.path}\u0000${target}`;
      const rev = `${target}\u0000${f.path}`;
      if (seen.has(key) || seen.has(rev)) continue;
      seen.add(key);
      links.push({ source: f.path, target });
      degree.set(f.path, (degree.get(f.path) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }
  // Client association per page, so the graph can filter "par client".
  // A client is a page under the `clients` category; its slug is the client id
  // (e.g. alstom, michelin). A page belongs to a client when it IS that client
  // page, when one of its tags matches a client slug, or when its filename is
  // prefixed with `<client>-` (the project naming convention).
  const clientSlugs = new Set<string>();
  for (const f of files) {
    if (f.category.toLowerCase() === 'clients' && f.slug !== '_index') {
      clientSlugs.add(f.slug.toLowerCase());
    }
  }
  const clientsOf = (f: WikiFile): string[] => {
    const found = new Set<string>();
    const slug = f.slug.toLowerCase();
    if (clientSlugs.has(slug)) found.add(slug);
    for (const tag of f.tags) {
      const t = tag.toLowerCase();
      if (clientSlugs.has(t)) found.add(t);
    }
    for (const client of clientSlugs) {
      if (slug.startsWith(`${client}-`)) found.add(client);
    }
    return [...found];
  };

  // Graph nodes are Markdown pages only; excalidraw assets stay in the tree but
  // out of the graph to avoid isolated clutter.
  const nodes: GraphNode[] = files
    .filter((f) => f.kind === 'markdown')
    .map((f) => ({
      id: f.path,
      label: f.title,
      group: f.group,
      degree: degree.get(f.path) ?? 0,
      clients: clientsOf(f),
    }));

  const resolve = (target: string): WikiResolveResult => {
    const path = resolveTarget(target);
    return path
      ? { href: `#wiki/${encodeURIComponent(path)}`, exists: true }
      : { href: '#wiki/missing', exists: false };
  };

  return {
    rootName,
    files,
    byPath,
    tree: buildTree(files),
    graph: { nodes, links },
    backlinks,
    resolve,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(MD_EXT, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/** Remove fenced and inline code so links inside code aren't counted. */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}

const WIKI_RE = /\[\[([^\]\n]+?)\]\]/g;
const MDLINK_RE = /\]\(([^)]+?)\)/g;

function extractTargets(file: WikiFile): string[] {
  const body = stripCode(file.content);
  const targets: string[] = [];

  WIKI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_RE.exec(body)) !== null) {
    const target = m[1].split('|')[0].split('#')[0].trim();
    if (target) targets.push(target);
  }

  MDLINK_RE.lastIndex = 0;
  while ((m = MDLINK_RE.exec(body)) !== null) {
    let href = m[1].trim().split(/\s+/)[0]; // drop optional "title"
    if (/^https?:/i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) continue;
    if (!/\.(md|markdown|mdown|mkd)(#|$)/i.test(href)) continue;
    href = href.split('#')[0];
    targets.push(resolveRelativePath(file.path, href).replace(MD_EXT, ''));
  }

  return targets;
}

function resolveRelativePath(fromPath: string, rel: string): string {
  const stack = fromPath.split('/').slice(0, -1);
  for (const part of rel.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * Meta/hub pages hidden from the sidebar tree (they link to everything and add
 * noise). They stay indexed and remain valid [[wikilink]] targets.
 */
const HIDDEN_SLUGS = new Set(['karpathy-llm-wiki']);

/** True for pages whose slug is in HIDDEN_SLUGS. */
function isHiddenSlug(path: string): boolean {
  const base = (path.split('/').pop() ?? path).toLowerCase();
  const slug = base.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  return HIDDEN_SLUGS.has(slug);
}

function buildTree(files: WikiFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', kind: 'dir', children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    // Hide underscore-prefixed files and folders (e.g. _index.md, _queries/).
    if (parts.some((p) => p.startsWith('_'))) continue;
    // Hide specific meta/hub pages from the tree (e.g. the Karpathy wiki-pattern page).
    if (isHiddenSlug(f.path)) continue;
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) {
        cur.children!.push({ name, path, kind: 'file', fileType: f.kind });
      } else {
        let dir = cur.children!.find((c) => c.kind === 'dir' && c.name === name);
        if (!dir) {
          dir = { name, path, kind: 'dir', children: [] };
          cur.children!.push(dir);
        }
        cur = dir;
      }
    }
  }
  sortTree(root);
  return root.children ?? [];
}

function sortTree(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
  );
  for (const child of node.children) sortTree(child);
}
