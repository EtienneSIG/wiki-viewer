// Electron main process for Wiki Viewer.
// Loads the Vite dev server in development, or the bundled `dist/index.html`
// in production. The renderer keeps using the browser File System Access API
// and IndexedDB, both supported by Electron's Chromium runtime.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');

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

/**
 * Share the current Markdown page by email: write it to a temp file and open a
 * new Outlook message with that file attached. On Windows, `start` resolves
 * `outlook.exe` through the App Paths registry key, so it works even when
 * Outlook is not on PATH. Falls back to revealing the file in the file manager
 * (or on Outlook launch failure) so the user can attach it manually.
 */
ipcMain.handle('share-email', async (_event, payload) => {
  const { filename, content } = payload || {};
  if (typeof content !== 'string') return { ok: false, error: 'no-content' };
  try {
    const dir = path.join(os.tmpdir(), 'wiki-viewer-share');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeFilename(filename));
    await fs.writeFile(filePath, content, 'utf8');

    if (process.platform === 'win32') {
      return await new Promise((resolve) => {
        execFile('cmd', ['/c', 'start', '', 'outlook.exe', '/a', filePath], (err) => {
          if (err) {
            shell.showItemInFolder(filePath);
            resolve({ ok: false, filePath, method: 'reveal', error: String(err) });
          } else {
            resolve({ ok: true, filePath, method: 'outlook' });
          }
        });
      });
    }

    shell.showItemInFolder(filePath);
    return { ok: true, filePath, method: 'reveal' };
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
