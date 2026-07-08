// Preload script. Runs in an isolated context with access to Node APIs.
// The renderer is a standard web app and currently needs no privileged
// bridges, so we only expose minimal, read-only environment info.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  /** Share a Markdown page by email (attaches it to a new Outlook message). */
  shareByEmail: (payload) => ipcRenderer.invoke('share-email', payload),
});
