const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pi', {
  send: (msg) => ipcRenderer.invoke('send-to-pi', msg),
  onEvent: (cb) => {
    const h = (_, e) => cb(e);
    ipcRenderer.on('pi-event', h);
    return () => ipcRenderer.removeListener('pi-event', h);
  },
  getStatus: () => ipcRenderer.invoke('get-pi-status'),
  onBlur: (cb) => {
    ipcRenderer.on('window-blur', cb);
    return () => ipcRenderer.removeListener('window-blur', cb);
  },
  dragMove: (p) => ipcRenderer.send('drag-move', p),
  restart: () => ipcRenderer.invoke('restart-pi'),

  // 原生右键菜单
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  onMenuAction: (cb) => {
    const h = (_, action) => cb(action);
    ipcRenderer.on('menu-action', h);
    return () => ipcRenderer.removeListener('menu-action', h);
  },

  // ========== 侧边栏停靠/恢复 ==========
  /** 恢复窗口（从停靠状态展开） */
  restoreWindow: () => ipcRenderer.invoke('restore-window'),
  /** 监听停靠状态变化: 'docked' | 'expanded' */
  onDockState: (cb) => {
    const h = (_, state) => cb(state);
    ipcRenderer.on('dock-state', h);
    return () => ipcRenderer.removeListener('dock-state', h);
  },
});
