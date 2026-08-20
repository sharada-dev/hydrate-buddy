const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hydrate', {
  // main -> renderer: a reminder should be shown now (payload: { name })
  onShow: (cb) => ipcRenderer.on('reminder:show', (_e, payload) => cb(payload || {})),
  // renderer -> main
  yes: () => ipcRenderer.send('reminder:yes'),
  snooze: () => ipcRenderer.send('reminder:snooze'),
  hide: () => ipcRenderer.send('reminder:hide'),
  // name settings (used by the reminder popup and the "Set your name" window)
  getName: () => ipcRenderer.invoke('name:get'),
  saveName: (value) => ipcRenderer.invoke('name:save', value),
  closeNameWindow: () => ipcRenderer.send('name:close'),
  // reminder-interval settings (used by the "Custom…" interval window)
  getInterval: () => ipcRenderer.invoke('interval:get'),
  saveInterval: (value) => ipcRenderer.invoke('interval:save', value),
  closeIntervalWindow: () => ipcRenderer.send('interval:close'),
  // first-run onboarding wizard
  closeOnboarding: () => ipcRenderer.send('onboarding:close'),
});
