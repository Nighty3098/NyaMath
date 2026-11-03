const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nyaElectron', {
  platform: process.platform,
  setNativeMenu: (template) => ipcRenderer.send('native-menu:set-template', template),
  onNativeMenuAction: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('native-menu:action', listener);
    return () => ipcRenderer.removeListener('native-menu:action', listener);
  },
  windowControls: {
    getMaximized: () => ipcRenderer.invoke('window-controls:get-state'),
    minimize: () => ipcRenderer.send('window-controls:minimize'),
    toggleMaximize: () => ipcRenderer.send('window-controls:toggle-maximize'),
    close: () => ipcRenderer.send('window-controls:close'),
    onMaximizedChange: (callback) => {
      const listener = (_event, maximized) => callback(maximized);
      ipcRenderer.on('window-controls:state', listener);
      return () => ipcRenderer.removeListener('window-controls:state', listener);
    },
  },
});
