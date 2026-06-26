const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ========== 全局异常处理：防止 EPIPE 崩溃 ==========
// Electron 的 stderr 管道断开时 console.error/log 会抛 EPIPE
process.on('uncaughtException', (err) => {
  if (err && err.code === 'EPIPE' && err.syscall === 'write') {
    // 父进程关闭管道，忽略，不影响桌宠运行
    return;
  }
  // 其他真实异常仍然打印
  try { process.stderr.write('Uncaught Exception: ' + (err?.stack || err) + '\n'); } catch (_) {}
});

let mainWindow = null;
let tray = null;
let piProcess = null;

const configFile = path.join(__dirname, 'window-pos.json');
const isDev = process.argv.includes('--dev');
const WINDOW_TITLE = '派派 PoiPoi';

// ========== 窗口尺寸 ==========
const WINDOW_WIDTH = 700;       // 内容区宽度（window-frame）
const WINDOW_HEIGHT = 440;
const TAB_WIDTH = 28;           // 侧边栏标签宽度（缩进后唯一可见部分）
const TOTAL_WIDTH = WINDOW_WIDTH + TAB_WIDTH;  // 窗口总宽度（含外侧猫咪按钮）

// ========== 停靠状态 ==========
let isDocked = false;
let expandedPosition = null;   // { x, y } 展开时的位置

// ========== 可见性（用透明度代替 hide，避免 Windows 重建任务栏图标） ==========
let isActuallyVisible = true;
let hiddenPosition = null;

// ========== 窗口位置 ==========

function loadWindowPos() {
  try {
    if (fs.existsSync(configFile)) {
      const pos = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      return { x: getRightX(), y: pos.y };
    }
  } catch (_) {}
  const { height } = screen.getPrimaryDisplay().workAreaSize;
  return { x: getRightX(), y: height - WINDOW_HEIGHT - 60 };
}

function saveWindowPos() {
  if (!mainWindow) return;
  try {
    const [, y] = mainWindow.getPosition();
    fs.writeFileSync(configFile, JSON.stringify({ x: getRightX(), y }));
  } catch (_) {}
}

// ========== 位置辅助函数 ==========

/** 内容区右侧贴边时窗口的 X 坐标（展开状态） */
function getRightX() {
  const { width } = screen.getPrimaryDisplay().size;
  return width - TOTAL_WIDTH;
}

/** 停靠时只露出猫咪按钮的 X 坐标 */
function getDockX() {
  const { width } = screen.getPrimaryDisplay().size;
  return width - TAB_WIDTH;
}

// ========== 平滑动画（逐帧移动窗口 X 坐标） ==========

function animateWindow(fromX, toX, fixedY, duration = 280) {
  return new Promise(resolve => {
    const steps = 20;
    const stepTime = duration / steps;
    const dx = (toX - fromX) / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step >= steps) {
        clearInterval(timer);
        mainWindow.setBounds({
          x: Math.round(toX),
          y: fixedY,
          width: TOTAL_WIDTH,
          height: WINDOW_HEIGHT,
        });
        resolve();
        return;
      }
      mainWindow.setPosition(Math.round(fromX + dx * step), fixedY);
    }, stepTime);
  });
}

// ========== 停靠 / 恢复 ==========

async function dockWindow() {
  if (!mainWindow || isDocked || mainWindow.isMinimized() || !isActuallyVisible) return;

  // 保存展开位置
  const [, curY] = mainWindow.getPosition();
  const rightX = getRightX();
  expandedPosition = { x: rightX, y: curY };

  // 如果当前 X 不是右对齐，先纠正
  const [curX] = mainWindow.getPosition();
  const startX = curX !== rightX ? rightX : curX;
  if (curX !== rightX) {
    mainWindow.setBounds({ x: rightX, y: curY, width: TOTAL_WIDTH, height: WINDOW_HEIGHT });
  }

  const targetX = getDockX();
  await animateWindow(startX, targetX, curY, 280);

  isDocked = true;
  mainWindow.webContents.send('dock-state', 'docked');
  mainWindow.setFocusable(false);
}

async function undockWindow() {
  if (!mainWindow || !isDocked || !expandedPosition) return;

  const { x: targetX, y: targetY } = expandedPosition;
  const [curX] = mainWindow.getPosition();

  // 唤醒窗口：确保窗口可聚焦、渲染进程活跃
  mainWindow.setFocusable(true);
  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }
  mainWindow.setOpacity(1);
  // 等一帧让渲染进程有时间恢复
  await new Promise(r => setTimeout(r, 50));

  await animateWindow(curX, targetX, targetY, 280);

  isDocked = false;
  mainWindow.webContents.send('dock-state', 'expanded');
  saveWindowPos();
}

// ========== 窗口创建 ==========

function createWindow() {
  const pos = loadWindowPos();

  mainWindow = new BrowserWindow({
    width: TOTAL_WIDTH,
    height: WINDOW_HEIGHT,
    x: pos.x,
    y: pos.y,
    type: 'toolbar',    // Windows 工具栏窗口，强制不在任务栏/托盘显示
    icon: path.join(__dirname, 'public', 'icon.png'),
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    enableLargerThanScreen: false,
    show: false,   // 手动控制显示时机
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setTitle(WINDOW_TITLE);
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  if (mainWindow.setWindowButtonVisibility) mainWindow.setWindowButtonVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setIgnoreMouseEvents(false);

  // 捕获渲染进程控制台日志（便于排查渲染器错误，生产环境可移除）
  const wc = mainWindow.webContents;
  // Electron 42 新 API: (event, {level, message, ...})
  // 旧 API:        (event, level, message, line, sourceId)
  wc.on('console-message', function(event, ...args) {
    const level = typeof args[0] === 'number' ? args[0] : args[0]?.level;
    const message = typeof args[0] === 'number' ? args[1] : args[0]?.message;
    if (message && typeof message === 'string' && !message.includes('%c')) {
      const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'unknown';
      console.log(`[renderer/${levelName}] ${message}`);
    }
  });

  // 强制窗口背景全透明（防止 GPU 合成层透出灰色）
  mainWindow.setBackgroundColor('#00000000');
  mainWindow.setOpacity(0);  // 初始透明，等渲染器就绪后再显示

  // 兜底：如果 8 秒后仍未收到 renderer-ready，强制显示窗口（防止渲染进程出错导致窗口永不显示）
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.getOpacity() < 1) {
        console.log('[pet] fallback: forcing window show (renderer-ready not received)');
        mainWindow.setSkipTaskbar(true);
        mainWindow.showInactive();
        mainWindow.setOpacity(1);
        const rightX = getRightX();
        const [, curY] = mainWindow.getPosition();
        mainWindow.setBounds({ x: rightX, y: curY, width: TOTAL_WIDTH, height: WINDOW_HEIGHT });
      }
    }
  }, 8000);

  // Draggable region：只允许上下拖动，X 强制右对齐
  ipcMain.on('drag-move', (_, p) => {
    if (mainWindow) {
      const [, curH] = mainWindow.getSize();
      // 停靠时 X 固定在 Dock 位置，展开时 X 固定在右侧贴边
      const targetX = isDocked ? getDockX() : getRightX();
      mainWindow.setBounds({ x: targetX, y: p.y, width: TOTAL_WIDTH, height: curH });
      expandedPosition = { x: getRightX(), y: p.y };
      saveWindowPos();
    }
  });

  // 拖拽后保存 Y 位置
  let saveTimer;
  mainWindow.on('move', () => {
    if (isDocked) return;
    const [curW, curH] = mainWindow.getSize();
    if (curW !== TOTAL_WIDTH || curH !== WINDOW_HEIGHT) {
      mainWindow.setSize(TOTAL_WIDTH, WINDOW_HEIGHT);
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!isDocked) {
        saveWindowPos();
        const [, y] = mainWindow.getPosition();
        expandedPosition = { x: getRightX(), y };
      }
    }, 300);
  });

  // ========== 失去焦点 → 自动停靠 ==========
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-blur');
    dockWindow();
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ========== 托盘的显示/隐藏切换 ==========

function showPetWindow() {
  if (!mainWindow) return;
  if (!isActuallyVisible) {
    mainWindow.setOpacity(1);
    mainWindow.setIgnoreMouseEvents(false);
    isActuallyVisible = true;
  }
  // 如果处于停靠状态，恢复展开
  if (isDocked) {
    undockWindow();
  }
}

function hidePetWindow() {
  if (!mainWindow) return;
  if (isActuallyVisible) {
    const [curX, curY] = mainWindow.getPosition();
    const [curW, curH] = mainWindow.getSize();
    hiddenPosition = { x: curX, y: curY, w: curW, h: curH, wasDocked: isDocked };
    isDocked = false;
    mainWindow.setOpacity(0);
    mainWindow.setIgnoreMouseEvents(true);
    isActuallyVisible = false;
  }
}

function togglePetWindow() {
  if (!mainWindow) return;
  if (isActuallyVisible && !isDocked) {
    // 完全展开可见 → 隐藏
    hidePetWindow();
  } else {
    // 隐藏中或停靠中 → 展开
    showPetWindow();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Pi Pet - AI 桌宠');
  tray.on('click', () => {
    togglePetWindow();
  });
  createTrayMenu();
}

function createTrayMenu() {
  const ctx = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => togglePetWindow(),
    },
    { type: 'separator' },
    {
      label: '位置',
      submenu: [
        {
          label: '顶部',
          click: () => {
            if (mainWindow) {
              if (isDocked) undockWindow();
              mainWindow.setPosition(getRightX(), 0);
            }
          },
        },
        {
          label: '中部',
          click: () => {
            if (mainWindow) {
              if (isDocked) undockWindow();
              const { height } = screen.getPrimaryDisplay().workAreaSize;
              mainWindow.setPosition(getRightX(), (height - WINDOW_HEIGHT) / 2);
            }
          },
        },
        {
          label: '底部',
          click: () => {
            if (mainWindow) {
              if (isDocked) undockWindow();
              const { height } = screen.getPrimaryDisplay().workAreaSize;
              mainWindow.setPosition(getRightX(), height - WINDOW_HEIGHT);
            }
          },
        },
      ],
    },
    { type: 'separator' },
    { label: '重新加载', click: () => mainWindow?.reload() },
    { label: '退出', click: () => { saveWindowPos(); app.quit(); } },
  ]);
  tray.setContextMenu(ctx);
}

// ========== 原生右键菜单 ==========

ipcMain.on('show-context-menu', () => {
  if (!mainWindow) return;
  const template = [
    {
      label: '💬 聊天',
      click: () => mainWindow.webContents.send('menu-action', 'talk'),
    },
    {
      label: '☀️ 天气',
      click: () => mainWindow.webContents.send('menu-action', 'weather'),
    },
    {
      label: '📰 新闻',
      click: () => mainWindow.webContents.send('menu-action', 'news'),
    },
    {
      label: '📜 历史对话',
      click: () => mainWindow.webContents.send('menu-action', 'history'),
    },
    {
      label: '🖥️ 打开 CMD-Pi',
      click: () => mainWindow.webContents.send('menu-action', 'pi-cmd'),
    },
    { type: 'separator' },
    {
      label: '🙈 隐藏',
      click: () => hidePetWindow(),
    },
    { type: 'separator' },
    {
      label: '🚪 退出',
      click: () => { saveWindowPos(); app.quit(); },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

// ========== pi RPC ==========

function startPiRPC() {
  if (piProcess) return;

  const sessionFile = path.join(__dirname, '.pi-pet-session');
  const sessionArg = [];
  if (fs.existsSync(sessionFile)) {
    try {
      const prev = fs.readFileSync(sessionFile, 'utf-8').trim();
      if (prev) sessionArg.push('--session', prev);
    } catch (_) {}
  }

  try {
    const cmd = 'pi --mode rpc ' + sessionArg.join(' ');
    piProcess = spawn(cmd, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.env.USERPROFILE || process.env.HOME,
      shell: true,  // Windows pi 是 .cmd 批处理，需通过 shell 执行
      windowsHide: true,
    });
    let buf = '';
    piProcess.stdout.on('data', (d) => {
      try {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'response' && event.data?.sessionFile) {
                try { fs.writeFileSync(sessionFile, event.data.sessionFile); } catch (_) {}
              }
              mainWindow?.webContents.send('pi-event', event);
            } catch (_) {}
          }
        }
      } catch (_) {}
    });

    setTimeout(() => {
      try {
        if (piProcess?.stdin?.writable) {
          piProcess.stdin.write(JSON.stringify({ type: 'get_state', id: 'init' }) + '\n');
        }
      } catch (_) {}
    }, 1000);

    piProcess.stderr.on('data', (d) => {
      try { console.error(`[pi] ${d}`); } catch (_) {}
    });
    piProcess.on('close', (c) => {
      try { console.log(`pi exited (${c})`); } catch (_) {}
      piProcess = null;
      setTimeout(startPiRPC, 2000);
    });
    piProcess.on('error', (e) => {
      try { console.error(`pi: ${e.message}`); } catch (_) {}
      piProcess = null;
    });
  } catch (e) {
    try { console.error('pi start failed:', e); } catch (_) {}
  }
}

function piSend(msg) {
  try {
    if (piProcess?.stdin?.writable) piProcess.stdin.write(JSON.stringify(msg) + '\n');
  } catch (_) {}
}

// ========== IPC ==========

ipcMain.handle('send-to-pi', (_, msg) => {
  if (msg?.type === 'hide') {
    hidePetWindow();
    return true;
  }
  if (msg?.type === 'quit') {
    saveWindowPos();
    app.quit();
    return true;
  }
  if (msg?.type === 'open-pi-cmd') {
    if (mainWindow.__piMonitor) {
      if (isActuallyVisible) {
        if (isDocked) undockWindow();
        mainWindow?.focus();
      }
      return true;
    }

    // 读取当前桌宠的 session，让 CMD-Pi 共享对话历史
    let sessionArg = '';
    try {
      const sf = path.join(__dirname, '.pi-pet-session');
      if (fs.existsSync(sf)) {
        const s = fs.readFileSync(sf, 'utf-8').trim();
        if (s) sessionArg = ` --session "${s.replace(/"/g, '\"')}"`;
      }
    } catch (_) {}

    const psScript = `
      $proc = Start-Process cmd -ArgumentList '/k cd /d %USERPROFILE% & pi${sessionArg}' -PassThru -WindowStyle Normal;
      $proc.WaitForExit();
      Write-Host "CMD_CLOSED";
    `;

    mainWindow.__piMonitor = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-Command', psScript.trim(),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    mainWindow.__piMonitor.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('CMD_CLOSED') || output.includes('exit')) {
        mainWindow.__piMonitor = null;
        showPetWindow();
      }
    });

    mainWindow.__piMonitor.on('close', () => {
      if (mainWindow.__piMonitor) {
        mainWindow.__piMonitor = null;
        showPetWindow();
      }
    });

    mainWindow.__piMonitor.on('error', () => {
      mainWindow.__piMonitor = null;
    });

    return true;
  }
  if (msg?.type === 'renderer-ready') {
    // 渲染器已就绪（Live2D + UI 全部加载完毕），显示窗口
    // 注意：窗口创建时 show: false，需要先 showInactive 再设透明度
    mainWindow.setSkipTaskbar(true);
    mainWindow.showInactive();
    mainWindow.setOpacity(1);
    // 窗口管理器首次定位后强制贴边（展开位置）
    const rightX = getRightX();
    const [, curY] = mainWindow.getPosition();
    mainWindow.setBounds({ x: rightX, y: curY, width: TOTAL_WIDTH, height: WINDOW_HEIGHT });
    return true;
  }
  piSend(msg);
  return true;
});

ipcMain.handle('get-pi-status', () => ({ running: piProcess !== null }));
ipcMain.handle('restart-pi', () => {
  if (piProcess) { piProcess.kill(); piProcess = null; }
  setTimeout(startPiRPC, 500);
  return true;
});

// ========== 侧边栏标签点击 → 切换停靠/展开 ==========
ipcMain.handle('restore-window', () => {
  // 唤醒渲染进程：即使窗口停靠已久、渲染进程被挂起，也能恢复
  if (mainWindow && !mainWindow.isDestroyed() && isDocked) {
    mainWindow.setFocusable(true);
    mainWindow.webContents.send('wake-up');
  }

  if (!isActuallyVisible) {
    showPetWindow();
    if (hiddenPosition?.wasDocked) {
      undockWindow();
    }
  } else if (isDocked) {
    undockWindow();
  } else {
    dockWindow();
  }
  return true;
});

// ========== 单实例锁（防止启动多个桌宠） ==========

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 已有桌宠运行时，再次尝试打开 → 把已运行的弹出来
    if (mainWindow) {
      if (!isActuallyVisible) showPetWindow();
      if (isDocked) undockWindow();
      mainWindow.focus();
    }
  });
}

// ========== 生命周期 ==========

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPiRPC();
});

app.on('will-quit', () => {});
app.on('window-all-closed', () => {
  if (piProcess) piProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  saveWindowPos();
  if (piProcess) piProcess.kill();
});
