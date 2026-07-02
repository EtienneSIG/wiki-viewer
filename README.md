# Wiki Viewer

Interface web pour visualiser, parcourir et éditer un wiki Markdown — pensée pour
le dossier [`memory/`](../memory) mais fonctionne avec n'importe quel dossier de
notes `.md`. Inspirée d'[Obsidian](https://obsidian.md) (vue graphe + backlinks)
et bâtie sur le moteur de rendu/édition de [**Markdit**](https://github.com/EtienneSIG/Markdit).

## Aperçu

### Lecture — rendu Markdown, `[[wikilinks]]` et arborescence

![Vue lecture de Wiki Viewer (thème clair)](docs/screenshots/reader-light.png)

### Graphe façon Obsidian — nœuds colorés par catégorie, légende et filtres

![Vue graphe de Wiki Viewer](docs/screenshots/graph-light.png)

### Recherche plein-texte — `Ctrl/Cmd + K`

![Palette de recherche de Wiki Viewer](docs/screenshots/search-light.png)

### Thème sombre

![Vue lecture de Wiki Viewer (thème sombre)](docs/screenshots/reader-dark.png)

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
- **Recherche plein-texte** — palette de recherche (bouton loupe ou `Ctrl/Cmd + K`)
  qui parcourt titres et contenu de toutes les pages, avec extraits surlignés,
  classement par pertinence et navigation au clavier (↑/↓, Entrée, Échap).
- **Thèmes** — système / clair / sombre / contraste élevé.
- **Multilingue** — interface en **français** et **anglais** ; bascule via le bouton
  langue de la barre d'outils. La langue est détectée depuis le navigateur au premier
  lancement puis mémorisée.

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

## Applications desktop (Windows & macOS)

L'application est empaquetée avec [Electron](https://www.electronjs.org/) via
[electron-builder]. Le rendu reste le même code web ; l'API File System Access et
IndexedDB fonctionnent dans le runtime Chromium d'Electron.

```bash
npm run electron:dev     # lance l'app Electron sur le serveur de dev Vite
npm run release:win      # génère un installateur Windows (NSIS) dans release/
npm run release:mac      # génère un .dmg (x64 + arm64) — nécessite macOS
npm run release:all      # les deux (chaque cible sur son OS natif)
```

Les artefacts sont produits dans le dossier `release/`.

### Générer les deux plateformes automatiquement

macOS ne peut pas être compilé depuis Windows (ni l'inverse pour la signature).
Le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml)
construit **Windows + macOS** sur des runners natifs et publie une GitHub Release :

```bash
git tag v0.1.0
git push origin v0.1.0   # déclenche le build multi-plateforme + la release
```

(Ou déclenchement manuel via l'onglet *Actions* → *Release* → *Run workflow*.)

### Build Windows local

- `npm run release:win` produit un **installateur NSIS**. La création de
  l'installateur signé requiert l'extraction de `winCodeSign`, qui a besoin du
  **Mode développeur Windows** activé (ou d'un terminal *Administrateur*) pour créer
  des liens symboliques.
- Sans ces droits, utilisez `npx electron-builder --win --dir` : cela génère une
  application décompressée fonctionnelle dans `release/win-unpacked/`
  (`Wiki Viewer.exe`), sans installateur ni signature.

[electron-builder]: https://www.electron.build/

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

## Licence

Distribué sous licence [MIT](LICENSE). © 2026 EtienneSIG.

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
