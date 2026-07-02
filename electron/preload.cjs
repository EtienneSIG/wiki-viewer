// Preload script. Runs in an isolated context with access to Node APIs.
// The renderer is a standard web app and currently needs no privileged
// bridges, so we only expose minimal, read-only environment info.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
});
