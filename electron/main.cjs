// Electron main process for Wiki Viewer.
// Loads the Vite dev server in development, or the bundled `dist/index.html`
// in production. The renderer keeps using the browser File System Access API
// and IndexedDB, both supported by Electron's Chromium runtime.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1421';

/** Window/taskbar icon (the "W" brand mark). */
const APP_ICON = path.join(__dirname, '..', 'build', 'icon.ico');

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open target="_blank" / external links in the user's default browser
  // instead of a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Strip path separators and reserved characters from a proposed filename. */
function safeFilename(name) {
  const base = String(name || 'document.md')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .trim();
  return base || 'document.md';
}

/** Run an executable and resolve to true on success (exit code 0). */
function execAsync(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, (err) => resolve(!err));
  });
}

/** Read a registry value, resolving to its raw string (or null). */
function regQuery(key, valueArgs) {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, ...valueArgs], (err, stdout) => {
      if (err) return resolve(null);
      const m = String(stdout).match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)/i);
      resolve(m ? m[1].trim() : null);
    });
  });
}

/** The Windows default mailto: handler ProgId (e.g. `Outlook.URL.mailto`). */
async function getDefaultMailProgId() {
  if (process.platform !== 'win32') return null;
  const raw = await regQuery(
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto\\UserChoice',
    ['/v', 'ProgId'],
  );
  return raw;
}

/** Extract the first executable path from a shell command string. */
function extractExe(command) {
  if (!command) return null;
  const quoted = command.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const bare = command.match(/^(\S+\.exe)/i);
  return bare ? bare[1] : null;
}

/** Full launch command registered for a mailto: ProgId (or null). */
async function getMailtoExe(progId) {
  if (!progId) return null;
  const cmd = await regQuery(`HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`, ['/ve']);
  return extractExe(cmd);
}

/** Build a mailto: URL with an optional prefilled subject and body. */
function buildMailto(subject, body) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * Share the current Markdown page by email in a client-agnostic way, preferring
 * the user's DEFAULT mail client:
 *  - Detect the default mailto: handler (Windows registry).
 *  - Classic Outlook → `outlook.exe /a <file>` (attaches automatically).
 *  - Thunderbird → `thunderbird -compose attachment=…,subject=…,body=…`.
 *  - Any other client (new Outlook, Windows Mail, Apple Mail, Linux MUAs, …) →
 *    open a compose window via the default `mailto:` handler and reveal the
 *    file so the user can attach it in one drag.
 */
ipcMain.handle('share-email', async (_event, payload) => {
  const { filename, content, subject, body } = payload || {};
  if (typeof content !== 'string') return { ok: false, error: 'no-content' };
  try {
    const dir = path.join(os.tmpdir(), 'wiki-viewer-share');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeFilename(filename));
    await fs.writeFile(filePath, content, 'utf8');

    if (process.platform === 'win32') {
      const progId = await getDefaultMailProgId();
      const exe = await getMailtoExe(progId);
      const hint = `${progId || ''} ${exe || ''}`;

      // Classic Outlook (OUTLOOK.EXE) supports the /a attach switch; the new
      // Outlook (olk.exe) does not, so it falls through to the mailto path.
      if (/outlook/i.test(hint) && exe && /outlook\.exe$/i.test(exe)) {
        if (await execAsync(exe, ['/a', filePath])) {
          return { ok: true, filePath, method: 'outlook' };
        }
      }

      // Thunderbird accepts a single -compose descriptor with an attachment URL.
      if (/thunderbird/i.test(hint) && exe) {
        const parts = [`attachment=${pathToFileURL(filePath).href}`];
        if (subject) parts.push(`subject=${subject}`);
        if (body) parts.push(`body=${body}`);
        if (await execAsync(exe, ['-compose', parts.join(',')])) {
          return { ok: true, filePath, method: 'thunderbird' };
        }
      }
    }

    // Universal fallback: open the default mail client's compose window and
    // reveal the attachment so it can be dragged in (works with every client).
    await shell.openExternal(buildMailto(subject, body));
    shell.showItemInFolder(filePath);
    return { ok: true, filePath, method: 'default' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
