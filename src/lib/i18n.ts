/**
 * Minimal localization scaffold (Principle VI — EU/NA reach; FR-016).
 * English and French strings are bundled; more locales can be added without
 * code changes. No content is sent anywhere for translation.
 */
export type Locale = 'en' | 'fr';

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  en: {
    'app.title': 'Markdit',
    'toolbar.bold': 'Bold',
    'toolbar.italic': 'Italic',
    'action.open': 'Open',
    'action.save': 'Save',
    'action.saving': 'Saving…',
    'action.saved': 'Saved',
    'action.saveFailed': 'Save failed.',
    'action.autosave': 'Auto',
    'action.autosaveOn': 'Autosave on — click to disable',
    'action.autosaveOff': 'Autosave off — click to enable',
    'action.copy': 'Copy',
    'action.copied': 'Copied — paste into OneNote, Word or Loop.',
    'action.copyFailed': 'Copy failed.',
    'view.read': 'Read',
    'view.edit': 'Edit',
    'view.source': 'Source',
    'view.graph': 'Graph',
    'view.contacts': 'Contacts',
    'contacts.search': 'Search a contact…',
    'contacts.empty': 'No contact directory found in this wiki.',
    'view.mode': 'View mode',
    'ribbon.group.font': 'Font',
    'ribbon.group.paragraph': 'Paragraph',
    'ribbon.group.insert': 'Insert',
    'ribbon.group.table': 'Table',
    'table.insert': 'Insert table',
    'table.addRow': 'Add row below',
    'table.deleteRow': 'Delete row',
    'table.addColumn': 'Add column right',
    'table.deleteColumn': 'Delete column',
    'table.delete': 'Delete table',
    'editor.label': 'Markdown editor',
    'notice.remoteBlocked':
      'Remote content is blocked. Enable it in Settings to load remote images.',
    'notice.enableRemote': 'Enable remote content',
    'notice.largeFile':
      'This file is large; syntax highlighting is disabled to keep it responsive.',
    'update.available': 'A new version of Markdit is available.',
    'update.availableVersion': 'Markdit {version} is available.',
    'update.install': 'Update now',
    'update.installing': 'Updating…',
    'update.failed': 'The update could not be installed. Please try again later.',
    'update.dismiss': 'Dismiss',
    'action.slides': 'Slides',
    'slides.title': 'Generate slides (Marp)',
    'slides.preview': 'Slide preview',
    'slides.source': 'Marp Markdown source',
    'slides.theme': 'Theme',
    'slides.count': '{n} slide(s) generated as a Marp deck (marp: true front-matter, --- separated). Open it in Marp, VS Code, or marp.app.',
    'slides.copy': 'Copy Markdown',
    'slides.copied': 'Copied to clipboard.',
    'slides.download': 'Download .md',
    'slides.save': 'Save .md…',
    'slides.exportHtml': 'Export HTML',
    'slides.saved': 'Saved to',
    'slides.close': 'Close',
    'sidebar.title': 'File navigation',
    'sidebar.toggle': 'Toggle file navigation',
    'sidebar.resize': 'Resize file navigation (drag, or arrow keys)',
    'sidebar.files': 'Files',
    'sidebar.openFolder': 'Open folder',
    'sidebar.openFiles': 'Open files',
    'sidebar.refresh': 'Refresh tree',
    'sidebar.refreshShort': 'Refresh',
    'sidebar.filesGroup': 'Files',
    'sidebar.removeRoot': 'Remove “{name}”',
    'sidebar.rootEmpty': 'No Markdown files here.',
    'sidebar.empty': 'Open a folder or files to browse your Markdown.',
    'sidebar.unsupported': 'Folder browsing is not supported in this environment. Use Open instead.',
    'sidebar.reopen': 'Reopen “{name}”',
    'conflict.title': 'File changed on disk',
    'conflict.body':
      'This file was modified outside Markdit. Reload the version on disk (your unsaved changes will be lost) or keep editing your version.',
    'conflict.reload': 'Reload from disk',
    'conflict.keep': 'Keep my version',
    'excalidraw.diagram': 'Excalidraw diagram',
    'excalidraw.invalid': 'This Excalidraw file could not be read.',
    'excalidraw.zoomIn': 'Zoom in',
    'excalidraw.zoomOut': 'Zoom out',
    'excalidraw.fit': 'Fit',
    'brand.wiki': 'Wiki',
    'action.openWiki': 'Open a wiki',
    'action.themeToggle': 'Change theme',
    'action.themeTitle': 'Theme: {theme}',
    'lang.toggle': 'Change language',
    'lang.name': 'English',
    'lang.short': 'EN',
    'confirm.unsaved': 'Unsaved changes. Continue?',
    'sidebar.pageCount': '{count} pages',
    'status.indexing': 'indexing…',
    'sidebar.noPages': 'No Markdown page found.',
    'sidebar.filterClient': 'Filter by client',
    'sidebar.allClients': 'All clients',
    'error.noMarkdownIn': 'No Markdown files found in “{name}”.',
    'graph.indexing': 'Indexing the graph…',
    'contacts.indexing': 'Indexing contacts…',
    'reader.selectPage': 'Select a page in the tree.',
    'empty.title': 'Wiki viewer',
    'empty.desc1': 'Open a folder of Markdown notes to browse the tree, read and edit your pages, follow ',
    'empty.desc2': ' links and explore the Obsidian-style graph.',
    'empty.linkWord': 'links',
    'empty.opening': 'Opening…',
    'empty.reopen': 'Reopen “{name}”',
    'backlinks.aria': 'Links',
    'backlinks.title': 'Backlinks',
    'backlinks.none': 'No page links here.',
    'backlinks.outgoing': 'Outgoing links',
    'backlinks.outNone': 'This page links to nothing.',
    'graph.filters': 'Graph filters',
    'graph.searchPage': 'Search a page…',
    'graph.orphans': 'Orphans',
    'graph.labels': 'Labels',
    'graph.spacing': 'Spacing',
    'graph.spacingAria': 'Spacing between nodes',
    'graph.filterClient': 'Filter by client',
    'graph.allClients': 'All clients',
    'graph.reorganize': 'Reorganize',
    'graph.resetView': 'Reset view',
    'graph.hint': 'Wheel: zoom · Drag: pan · Click: open',
    'status.appInfo': 'Application information',
    'status.license': 'License {license}',
    'search.open': 'Search',
    'search.title': 'Search the wiki',
    'search.placeholder': 'Search pages by title or content…',
    'search.hint': 'Type to search across all your pages.',
    'search.noResults': 'No page matches your search.',
    'search.count': '{count} result(s)',
    'update.check': 'Check for updates',
    'update.checking': 'Checking…',
    'update.upToDate': 'Up to date',
    'update.unavailable': 'Check unavailable',
    'update.badge': 'Update {version}',
    'update.availableTitle': 'Version {version} available',
  },
  fr: {
    'app.title': 'Markdit',
    'toolbar.bold': 'Gras',
    'toolbar.italic': 'Italique',
    'action.open': 'Ouvrir',
    'action.save': 'Enregistrer',
    'action.saving': 'Enregistrement…',
    'action.saved': 'Enregistré',
    'action.saveFailed': "Échec de l'enregistrement.",
    'action.autosave': 'Auto',
    'action.autosaveOn': 'Enregistrement auto activé — cliquer pour désactiver',
    'action.autosaveOff': 'Enregistrement auto désactivé — cliquer pour activer',
    'action.copy': 'Copier',
    'action.copied': 'Copié — collez dans OneNote, Word ou Loop.',
    'action.copyFailed': 'Échec de la copie.',
    'view.read': 'Lecture',
    'view.edit': 'Édition',
    'view.source': 'Source',
    'view.graph': 'Graphe',
    'view.contacts': 'Contacts',
    'contacts.search': 'Rechercher un contact…',
    'contacts.empty': 'Aucun annuaire de contacts trouvé dans ce wiki.',
    'view.mode': 'Mode d’affichage',
    'ribbon.group.font': 'Police',
    'ribbon.group.paragraph': 'Paragraphe',
    'ribbon.group.insert': 'Insérer',
    'ribbon.group.table': 'Tableau',
    'table.insert': 'Insérer un tableau',
    'table.addRow': 'Ajouter une ligne en dessous',
    'table.deleteRow': 'Supprimer la ligne',
    'table.addColumn': 'Ajouter une colonne à droite',
    'table.deleteColumn': 'Supprimer la colonne',
    'table.delete': 'Supprimer le tableau',
    'editor.label': 'Éditeur Markdown',
    'notice.remoteBlocked':
      'Le contenu distant est bloqué. Activez-le dans les Réglages pour charger les images distantes.',
    'notice.enableRemote': 'Activer le contenu distant',
    'notice.largeFile':
      'Ce fichier est volumineux ; la coloration syntaxique est désactivée pour rester réactif.',
    'update.available': 'Une nouvelle version de Markdit est disponible.',
    'update.availableVersion': 'Markdit {version} est disponible.',
    'update.install': 'Mettre à jour',
    'update.installing': 'Mise à jour…',
    'update.failed': "La mise à jour n'a pas pu être installée. Veuillez réessayer plus tard.",
    'update.dismiss': 'Ignorer',
    'action.slides': 'Diapositives',
    'slides.title': 'Générer des diapositives (Marp)',
    'slides.preview': 'Aperçu des diapositives',
    'slides.source': 'Source Markdown Marp',
    'slides.theme': 'Thème',
    'slides.count':
      '{n} diapositive(s) générée(s) au format Marp (en-tête marp: true, séparées par ---). Ouvrez-les dans Marp, VS Code ou marp.app.',
    'slides.copy': 'Copier le Markdown',
    'slides.copied': 'Copié dans le presse-papiers.',
    'slides.download': 'Télécharger .md',
    'slides.save': 'Enregistrer .md…',
    'slides.exportHtml': 'Exporter en HTML',
    'slides.saved': 'Enregistré dans',
    'slides.close': 'Fermer',
    'sidebar.title': 'Navigation des fichiers',
    'sidebar.toggle': 'Afficher/masquer la navigation',
    'sidebar.resize': 'Redimensionner la navigation (glisser ou flèches)',
    'sidebar.files': 'Fichiers',
    'sidebar.openFolder': 'Ouvrir un dossier',
    'sidebar.openFiles': 'Ouvrir des fichiers',
    'sidebar.refresh': "Rafraîchir l'arborescence",
    'sidebar.refreshShort': 'Rafraîchir',
    'sidebar.filesGroup': 'Fichiers',
    'sidebar.removeRoot': 'Retirer « {name} »',
    'sidebar.rootEmpty': 'Aucun fichier Markdown ici.',
    'sidebar.empty': 'Ouvrez un dossier ou des fichiers pour parcourir votre Markdown.',
    'sidebar.unsupported':
      "La navigation par dossier n'est pas prise en charge dans cet environnement. Utilisez Ouvrir.",
    'sidebar.reopen': 'Rouvrir « {name} »',
    'conflict.title': 'Fichier modifié sur le disque',
    'conflict.body':
      "Ce fichier a été modifié en dehors de Markdit. Rechargez la version du disque (vos modifications non enregistrées seront perdues) ou continuez avec votre version.",
    'conflict.reload': 'Recharger depuis le disque',
    'conflict.keep': 'Conserver ma version',
    'excalidraw.diagram': 'Diagramme Excalidraw',
    'excalidraw.invalid': "Ce fichier Excalidraw n'a pas pu être lu.",
    'excalidraw.zoomIn': 'Zoom avant',
    'excalidraw.zoomOut': 'Zoom arrière',
    'excalidraw.fit': 'Ajuster',
    'brand.wiki': 'Wiki',
    'action.openWiki': 'Ouvrir un wiki',
    'action.themeToggle': 'Changer de thème',
    'action.themeTitle': 'Thème : {theme}',
    'lang.toggle': 'Changer de langue',
    'lang.name': 'Français',
    'lang.short': 'FR',
    'confirm.unsaved': 'Modifications non enregistrées. Continuer ?',
    'sidebar.pageCount': '{count} pages',
    'status.indexing': 'indexation…',
    'sidebar.noPages': 'Aucune page Markdown trouvée.',
    'sidebar.filterClient': 'Filtrer par client',
    'sidebar.allClients': 'Tous les clients',
    'error.noMarkdownIn': 'Aucun fichier Markdown trouvé dans « {name} ».',
    'graph.indexing': 'Indexation du graphe en cours…',
    'contacts.indexing': 'Indexation des contacts en cours…',
    'reader.selectPage': 'Sélectionnez une page dans l’arborescence.',
    'empty.title': 'Visualiseur de wiki',
    'empty.desc1': 'Ouvrez un dossier de notes Markdown pour parcourir l’arborescence, lire et éditer vos pages, suivre les ',
    'empty.desc2': ' et explorer le graphe façon Obsidian.',
    'empty.linkWord': 'liens',
    'empty.opening': 'Ouverture…',
    'empty.reopen': 'Rouvrir « {name} »',
    'backlinks.aria': 'Liens',
    'backlinks.title': 'Backlinks',
    'backlinks.none': 'Aucune page ne pointe ici.',
    'backlinks.outgoing': 'Liens sortants',
    'backlinks.outNone': 'Cette page ne pointe vers rien.',
    'graph.filters': 'Filtres du graphe',
    'graph.searchPage': 'Rechercher une page…',
    'graph.orphans': 'Orphelins',
    'graph.labels': 'Étiquettes',
    'graph.spacing': 'Espacement',
    'graph.spacingAria': 'Espacement entre les nœuds',
    'graph.filterClient': 'Filtrer par client',
    'graph.allClients': 'Tous les clients',
    'graph.reorganize': 'Réorganiser',
    'graph.resetView': 'Réinitialiser la vue',
    'graph.hint': 'Molette : zoom · Glisser : déplacer · Clic : ouvrir',
    'status.appInfo': 'Informations sur l’application',
    'status.license': 'Licence {license}',
    'search.open': 'Rechercher',
    'search.title': 'Rechercher dans le wiki',
    'search.placeholder': 'Rechercher une page par titre ou contenu…',
    'search.hint': 'Saisissez du texte pour chercher dans toutes vos pages.',
    'search.noResults': 'Aucune page ne correspond à votre recherche.',
    'search.count': '{count} résultat(s)',
    'update.check': 'Vérifier les mises à jour',
    'update.checking': 'Vérification…',
    'update.upToDate': 'À jour',
    'update.unavailable': 'Vérification indisponible',
    'update.badge': 'Mise à jour {version}',
    'update.availableTitle': 'Version {version} disponible',
  },
};

export const LOCALES: Locale[] = ['fr', 'en'];

const STORAGE_KEY = 'wv-lang';

function normalize(locale: string): Locale {
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function detectInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalize(saved);
  } catch {
    /* ignore private-mode errors */
  }
  // English is the default language when the user has no saved preference.
  return 'en';
}

let current: Locale = detectInitial();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: string): Locale {
  current = normalize(locale);
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* ignore quota / private-mode errors */
  }
  return current;
}

/**
 * Look up a localized string, falling back to English then the raw key.
 * `{placeholder}` tokens are replaced from `params` when provided.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
  }
  return text;
}
