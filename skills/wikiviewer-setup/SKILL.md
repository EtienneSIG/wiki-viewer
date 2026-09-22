---
name: wikiviewer-setup
description: Scaffold or convert a folder of Markdown notes into a repository that is fully compatible with Wiki Viewer (https://github.com/EtienneSIG/wiki-viewer). Use when a user wants to "set up a wiki", "make my notes compatible with Wiki Viewer", "create a wiki repo", organize Markdown for the Obsidian-style graph/backlinks, add frontmatter/tags/categories, wire up [[wikilinks]], enable the client filter, or build the customer contacts graph. Produces standard CommonMark/GFM Markdown with a tiny YAML frontmatter — no proprietary format.
---

# Wiki Viewer — repository setup

Wiki Viewer reads a plain folder of Markdown files and derives a file tree, an
Obsidian-style link graph, backlinks, full-text search and (optionally) a
customer-contacts graph. There is **no database and no proprietary format**:
everything is inferred from file names, folders, YAML frontmatter and
`[[wikilinks]]`. This skill makes a repository follow those conventions exactly.

Follow the conventions below precisely — they mirror how Wiki Viewer parses a
wiki (`src/lib/wiki.ts`, `src/lib/frontmatter.ts`, `src/lib/contacts.ts`,
`src/markdown/remark-wikilink.ts`).

---

## 1. Quick checklist

When setting up or converting a wiki, ensure:

- [ ] There is an entry page: `index.md` (preferred) or `README.md` at the root.
- [ ] Every page is a Markdown file: `.md`, `.markdown`, `.mdown` or `.mkd`.
- [ ] Each page starts with a small YAML frontmatter block (`title`, `tags`,
      `category`) — see the tiny-YAML rules in §3.
- [ ] Pages reference each other with `[[wikilinks]]` (by title or slug).
- [ ] Related pages share a `category` (drives folders/graph colors).
- [ ] Stub / index / meta pages are prefixed with `_` to hide them.
- [ ] No content lives inside ignored folders (see §8).
- [ ] (Optional) Client pages + `clients` category to enable the client filter (§6).
- [ ] (Optional) `contacts-<account>.md` directory pages for the contacts graph (§7).

---

## 2. Folder layout

Wiki Viewer scans the opened folder **recursively**. Folders are shown as
collapsible groups in the file tree. A page's **category defaults to its parent
folder name** when no `category` frontmatter is set, so folders double as a
grouping mechanism.

Recommended layout:

```
my-wiki/
├── index.md                 # entry point (or README.md)
├── _index.md                # optional hidden hub linking everything
├── domains/
│   ├── architecture.md
│   └── security.md
├── projects/
│   ├── project-apollo.md
│   └── project-zephyr.md
├── clients/                 # optional — enables the client filter (§6)
│   ├── alstom.md
│   └── michelin.md
├── contacts/                # optional — feeds the contacts graph (§7)
│   ├── contacts-alstom.md
│   └── contacts-michelin.md
└── diagrams/
    └── overview.excalidraw  # optional Excalidraw diagram asset
```

- **Slug** = file name without extension (e.g. `architecture.md` → `architecture`).
  Keep slugs lowercase, hyphen-separated and unique across the wiki — they are
  `[[wikilink]]` targets and should be stable.
- The first-opened page is `index.md`, else `readme.md`, else the first file.

---

## 3. Page frontmatter (tiny YAML subset)

Each Markdown page **should** begin with a YAML frontmatter block fenced by
`---`. Wiki Viewer uses a **deliberately tiny YAML parser** — respect its limits:

Supported:

```markdown
---
title: Reference Architecture
category: domains
tags: [architecture, platform, reference]
created: 2026-01-15
updated: 2026-02-03
---

# Reference Architecture

Body content in standard Markdown…
```

Also valid — a block sequence for tags:

```markdown
---
title: Security Baseline
category: domains
tags:
  - security
  - compliance
---
```

Parser rules (do **not** exceed them):

- Only `key: value` scalars, inline flow lists `key: [a, b]`, and block
  sequences (`- item` lines) are understood.
- **No nested maps, no multi-line scalars, no anchors/aliases.** Unknown/complex
  keys are ignored harmlessly but won't be read.
- Surrounding single or double quotes are stripped from scalars.
- Comment lines (`# …`) inside frontmatter are skipped.
- The block must be the very first thing in the file (a leading BOM and CRLF are
  tolerated).

Fields Wiki Viewer actually consumes:

| Field      | Type            | Effect |
|------------|-----------------|--------|
| `title`    | string          | Display title, graph label, and a `[[wikilink]]` target. Falls back to the slug. |
| `category` | string          | Graph group/color and the properties chip. Falls back to the parent folder name. |
| `tags`     | list of strings | Properties chips; used by the client filter (§6) and contacts detection (§7). Also: a tag `retrospective` (or a slug containing `retrospective`) removes the page from the graph. |

Other fields (dates, authors…) are fine to include for humans but are not
interpreted. Frontmatter is **preserved byte-for-byte** when the page is saved
from the editor, so it is safe to keep extra metadata.

---

## 4. Links: `[[wikilinks]]` and relative Markdown links

Cross-link pages so the graph and backlinks light up.

**Wikilinks (preferred):**

```markdown
See the [[architecture]] page and the [[Security Baseline|security notes]].
Jump to a heading: [[architecture#data-flow|data flow]].
```

- `[[target]]`, `[[target|alias]]`, `[[target#heading|alias]]` all work.
- `target` resolves case-insensitively (spaces become dashes) against, in order:
  a page **slug**, a page **title**, or a full **path**. First match wins.
- A missing target still renders, flagged visually as an unresolved link — useful
  as a "to-create" placeholder.

**Relative Markdown links** also count toward the graph:

```markdown
See [architecture](domains/architecture.md).
```

- Only links ending in `.md`/`.markdown`/`.mdown`/`.mkd` are treated as page
  links. `http(s):`, `mailto:` and pure `#anchor` links are ignored.
- Links inside fenced code blocks or inline `code` are **not** counted.

---

## 5. Categories, the graph and hidden pages

- **Graph nodes** are Markdown pages; **edges** are the links from §4. Excalidraw
  files never appear in the graph (they stay in the tree as openable assets).
- **Category = color/group.** Give related pages the same `category` (or put them
  in the same folder) for a readable, well-clustered graph.
- **Backlinks** are computed automatically — the right-hand panel lists every
  page that links to the current one, plus its outgoing links.

**Hidden pages — the `_` convention.** Prefix a file or folder with an underscore
to hide it from the **file tree, the graph and full-text search** while keeping
it a valid `[[wikilink]]` target:

```
_index.md            # hidden hub / table of contents
_drafts/             # every page under here is hidden
_meta-notes.md
```

Use this for stub pages, aggregate/hub pages that link to everything, drafts and
meta notes that would otherwise clutter the graph.

---

## 6. Client filter (optional)

Wiki Viewer has a checkbox dropdown that restricts the tree, search and both
graphs to one or several **clients**. To enable it, adopt this convention:

1. Create one page per client under a `clients` **category**. The page **slug is
   the client id** (e.g. `alstom.md` → client `alstom`). Put it in a `clients/`
   folder or set `category: clients` in frontmatter. Do **not** prefix it with `_`.

   ```markdown
   ---
   title: Alstom
   category: clients
   tags: [client]
   ---
   ```

2. A page is then associated with a client when **any** of these is true:
   - it **is** that client page (slug = client id), or
   - one of its **tags** equals a client id (`tags: [alstom]`), or
   - its **slug is prefixed** with `<client>-` (e.g. `alstom-roadmap.md`,
     `alstom-fy26-plan.md`).

Adopt the `<client>-<topic>.md` naming convention for client-specific pages so
they are picked up automatically.

---

## 7. Customer contacts graph (optional, advanced)

Wiki Viewer can render a second, purpose-built graph of customer **contacts**
(accounts as hubs, contacts as leaves). It is built from **per-account directory
pages**. Only set this up if the wiki tracks customer contacts.

**Per-account directory page** — one per account, e.g. `contacts-alstom.md`:

- Slug **must start with `contacts-`** (the part after it is the account id, and
  should match a client page slug from §6, e.g. `alstom`).
- Frontmatter **must include both tags** `contacts` and `directory`.
- The account hub label comes from the page `title` (text before an em dash).
- List contacts in **GitHub-flavored Markdown tables**. Each non-empty first-cell
  row becomes a contact leaf linked to the account hub.

```markdown
---
title: Alstom — Contacts directory
category: contacts
tags: [contacts, directory]
---

## Alstom

| Name            | Role                | Trusted advisor pour Alex | Sponsor / Detracteur |
|-----------------|---------------------|---------------------------|----------------------|
| Marie Dupont    | CTO                 | yes                       | Sponsor              |
| Jean Martin     | Head of Platform    |                           | Detractor            |
```

Recognized (optional) columns, detected by header text (order-independent):

- **`Trusted advisor …`** → marks the contact with a gold advisor dot (values
  like `yes`, `oui`, `x`, `true`).
- **`Sponsor / Detracteur`** (or `Stance`) → green ring for `sponsor`, red for
  `detractor`, otherwise neutral.

**Optional enrichment pages** (create only if you have the data):

- `contact-influence-map.md` — per-account "Clusters d'influence" tables whose
  "Lien central" column lists names joined by `↔`, `·` or `(+ …)`. Adds inferred
  contact↔contact **influence** edges (drawn dashed/orange).
- `contact-cooccurrence-network.md` — per-account `### Arêtes` tables whose first
  column is `Name A ↔ Name B`. Adds an optional empirical **co-occurrence** layer
  (toggle in the UI, drawn finely dotted/teal).

If no `contacts-*` directory pages exist, the contacts graph simply stays empty —
the rest of the wiki works normally.

---

## 8. Ignored & skipped locations

Wiki Viewer never scans these, so don't put wiki content in them:

- Dependency/build folders: `node_modules`, `dist`, `build`, `out`, `coverage`,
  `vendor`, `target`, `.next`, `.turbo`, `.cache`.
- Any **dot-prefixed** folder (`.git`, `.obsidian`, `.github`, …).

These are safe to keep in the repo (a `.git` folder, an Obsidian vault config,
CI under `.github/`) — they are simply invisible to the wiki.

---

## 9. Excalidraw diagrams (optional)

Drop `.excalidraw` files anywhere in the tree. They appear in the file tree with
a diagram icon and open in a read-only Excalidraw viewer. They are **not** part
of the link graph and are not `[[wikilink]]` targets.

---

## 10. Minimal scaffold to create

When asked to scaffold a new wiki from scratch, create at least:

**`index.md`**

```markdown
---
title: Home
category: _root
tags: [index]
---

# My Wiki

Welcome. Start from these areas:

- [[architecture]] — system design
- [[security]] — security baseline

> Tip: link pages with `[[Page Title]]` and group them with a `category`.
```

**`domains/architecture.md`**

```markdown
---
title: Reference Architecture
category: domains
tags: [architecture]
---

# Reference Architecture

The platform links back to the [[Home]] page and to [[security]].
```

**`domains/security.md`**

```markdown
---
title: Security Baseline
category: domains
tags: [security]
---

# Security Baseline

See the [[Reference Architecture|architecture]] for context.
```

This produces a working graph (two connected `domains` nodes + the home hub),
backlinks, and a browsable tree the moment the folder is opened in Wiki Viewer.

---

## 11. Validation before finishing

After creating/editing, sanity-check:

- Every `[[wikilink]]` resolves to an existing page (or is an intentional
  "to-create" placeholder).
- Every page has a `title`; related pages share a `category`.
- No stray complex YAML (nested maps, multi-line values) in frontmatter.
- Hidden hubs/stubs use the `_` prefix.
- (If used) client pages sit under `category: clients` and client-specific pages
  follow the `<client>-<topic>.md` naming.
- (If used) `contacts-<account>.md` pages carry the `contacts` + `directory` tags
  and use Markdown tables.
