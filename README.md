# Wiki Viewer

Interface web pour visualiser, parcourir et éditer un wiki Markdown — pensée pour
le dossier [`memory/`](../memory) mais fonctionne avec n'importe quel dossier de
notes `.md`. Inspirée d'[Obsidian](https://obsidian.md) (vue graphe + backlinks)
et bâtie sur le moteur de rendu/édition de [**Markdit**](https://github.com/EtienneSIG/Markdit).

## Fonctionnalités

- **Ouvrir un wiki** — un bouton, un sélecteur de dossier (File System Access API),
  et tout le dossier est chargé. Le dernier dossier ouvert est ré-ouvert au démarrage.
- **Arborescence** — navigation par dossiers/fichiers repliable, façon Markdit.
- **Lecture** — rendu Markdown (remark/rehype) sécurisé, avec coloration syntaxique
  Shiki, exactement comme dans Markdit.
- **Édition** — éditeur WYSIWYG TipTap ; le Markdown reste la source de vérité
  (aucun format propriétaire). `Ctrl/Cmd + S` pour enregistrer sur le disque.
- **Graphe façon Obsidian** — graphe de force (canvas) : nœuds = pages,
  arêtes = `[[liens]]`. Zoom molette, déplacement, glisser un nœud, survol pour
  isoler les voisins, recherche, masquer les orphelins, étiquettes, légende par
  catégorie. Clic sur un nœud → ouvre la page.
- **`[[wikilinks]]`** — les liens `[[cible]]` et `[[cible|alias]]` deviennent
  cliquables dans le lecteur ; les cibles inexistantes sont signalées visuellement.
- **Backlinks** — panneau latéral listant les pages qui pointent vers la page
  courante, plus ses liens sortants.
- **Thèmes** — système / clair / sombre / contraste élevé.

## Prérequis

- **Node.js** 18+ (pour le serveur de dev / le build).
- Un navigateur **Chromium** (Edge, Chrome…) : l'ouverture de dossier repose sur
  la [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API),
  non disponible dans Firefox/Safari.

## Démarrage

```bash
cd wiki-viewer
npm install
npm run dev
```

Puis ouvrez http://localhost:1421, cliquez **Ouvrir un wiki** et sélectionnez le
dossier `memory` (ou tout autre dossier de notes Markdown). Autorisez l'accès en
lecture/écriture pour pouvoir enregistrer vos modifications.

## Build de production

```bash
npm run build      # vérifie les types (tsc) puis génère dist/
npm run preview    # sert le build de production
```

## Notes techniques

- **Réutilise Markdit tel quel** pour le pipeline Markdown
  (`src/markdown/*`) et les composants lecteur/éditeur/barre d'outils. Le rendu et
  l'édition sont donc identiques à Markdit.
- **Modèle wiki** (`src/lib/wiki.ts`) : scanne le dossier, résout les `[[liens]]`
  (par slug, titre ou chemin), construit l'arborescence, le graphe et les backlinks.
  `buildModel()` est pur (sans API navigateur) et recalculé après chaque
  enregistrement pour rafraîchir graphe/backlinks.
- **`[[wikilinks]]`** (`src/markdown/remark-wikilink.ts`) : transformation
  mdast→mdast appliquée **uniquement au rendu**, jamais au parse partagé de
  l'éditeur — le Markdown `[[...]]` est donc préservé à l'octet près à la sauvegarde.
- **Frontmatter** (`src/lib/frontmatter.ts`) : le bloc YAML est détaché pour la
  lecture/édition puis ré-attaché verbatim à l'enregistrement (pas d'aller-retour
  YAML destructif).
- **Persistance** : seuls des handles opaques de dossier sont stockés dans
  IndexedDB ; rien ne quitte l'appareil.
- Le port de dev est **1421** (Markdit utilise 1420).

## Structure

```
src/
├── app/            App.tsx (shell), theme.ts
├── components/
│   ├── reader/     Reader.tsx        (Markdit + navigation [[liens]])
│   ├── editor/     Editor.tsx        (Markdit, TipTap)
│   ├── toolbar/    Toolbar.tsx, actions.ts (Markdit)
│   ├── sidebar/    FileTree.tsx      (arborescence)
│   ├── backlinks/  Backlinks.tsx     (backlinks + liens sortants)
│   └── graph/      GraphView.tsx     (graphe force-directed, canvas)
├── lib/            wiki.ts, frontmatter.ts, folder-handle.ts, i18n.ts, types.ts
├── markdown/       parse, render, sanitize, serialize, highlight, tiptap-bridge,
│                   remark-wikilink
└── styles.css      (Markdit + additions .wv-*)
```
