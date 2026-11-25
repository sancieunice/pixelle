const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelleDesktop', {
  startDrag: () => ipcRenderer.send('start-drag'),
  endDrag: () => ipcRenderer.send('end-drag'),
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', interactive),
  openStudio: () => ipcRenderer.send('open-studio')
});
