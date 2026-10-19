const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cineResenhaWindow', {
    setFullscreen: (fullscreen) => ipcRenderer.invoke('app:set-fullscreen', fullscreen),
    isCredentialStorageAvailable: () => ipcRenderer.invoke('admin:credential-storage-available'),
    getRememberedAdminCredentials: () => ipcRenderer.invoke('admin:get-remembered-credentials'),
    setRememberedAdminCredentials: (credentials) => ipcRenderer.invoke('admin:set-remembered-credentials', credentials),
    onFullscreenChanged: (callback) => {
        const listener = (_event, fullscreen) => callback(fullscreen);
        ipcRenderer.on('app:fullscreen-changed', listener);
        return () => ipcRenderer.removeListener('app:fullscreen-changed', listener);
    },
});
