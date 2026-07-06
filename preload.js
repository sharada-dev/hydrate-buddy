const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hydrate', {
  // main -> renderer: a reminder should be shown now
  onShow: (cb) => ipcRenderer.on('reminder:show', () => cb()),
  // renderer -> main
  yes: () => ipcRenderer.send('reminder:yes'),
  snooze: () => ipcRenderer.send('reminder:snooze'),
  hide: () => ipcRenderer.send('reminder:hide'),
});
