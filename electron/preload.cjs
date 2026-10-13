/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recordWebCursor', {
  getDisplays: () => ipcRenderer.invoke('cursor:get-displays'),
  selectDisplay: (displayId) => ipcRenderer.invoke('cursor:select-display', displayId),
  start: (options) => ipcRenderer.invoke('cursor:start', options),
  pause: (sessionId) => ipcRenderer.invoke('cursor:pause', sessionId),
  resume: (sessionId) => ipcRenderer.invoke('cursor:resume', sessionId),
  stop: (sessionId, durationMs) => ipcRenderer.invoke('cursor:stop', sessionId, durationMs),
  reset: (sessionId) => ipcRenderer.invoke('cursor:reset', sessionId),
});
