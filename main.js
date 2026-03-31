// Pix 截图工具 - Electron 主进程
const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, screen, nativeImage, clipboard, dialog, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 禁止多实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ============ 全局状态 ============
let tray = null;
let captureWindow = null;
let settingsWindow = null;
let pinWindows = [];
let ocrWindow = null;
let store = null;

// ============ 配置管理 ============
async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store({
    defaults: {
      shortcuts: {
        capture: 'Ctrl+Alt+A',
        scrollCapture: 'Ctrl+Alt+S',
      },
      savePath: app.getPath('pictures'),
      imageFormat: 'png',
      autoStart: false,
      translate: {
        defaultEngine: 'google',
        google: {
          enabled: true,
        },
        customApis: [],
      },
    },
  });
  return store;
}

// ============ 系统托盘 ============
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icons', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    // 如果图标加载失败，使用空图标
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Pix 截图工具');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📸 截图',
      accelerator: store?.get('shortcuts.capture') || 'Ctrl+Alt+A',
      click: () => startCapture(),
    },
    {
      label: '📜 长截图',
      accelerator: store?.get('shortcuts.scrollCapture') || 'Ctrl+Alt+S',
      click: () => startScrollCapture(),
    },
    { type: 'separator' },
    {
      label: '⚙️ 设置',
      click: () => openSettings(),
    },
    { type: 'separator' },
    {
      label: '❌ 退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => startCapture());
}

// ============ 全局快捷键 ============
function registerShortcuts() {
  const captureKey = store?.get('shortcuts.capture') || 'Ctrl+Alt+A';
  const scrollKey = store?.get('shortcuts.scrollCapture') || 'Ctrl+Alt+S';

  globalShortcut.unregisterAll();

  try {
    globalShortcut.register(captureKey, () => startCapture());
    globalShortcut.register(scrollKey, () => startScrollCapture());
  } catch (e) {
    console.error('快捷键注册失败:', e.message);
  }
}

// ============ 截图功能 ============
async function startCapture() {
  if (captureWindow) {
    captureWindow.close();
    captureWindow = null;
  }

  // 获取所有显示器信息
  const displays = screen.getAllDisplays();
  // 计算覆盖所有显示器的区域
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  displays.forEach(d => {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  });

  // 获取屏幕截图
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxX - minX, height: maxY - minY },
    });

    if (sources.length === 0) return;

    // 创建全屏透明窗口
    captureWindow = new BrowserWindow({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreen: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    captureWindow.setAlwaysOnTop(true, 'screen-saver');
    captureWindow.loadFile(path.join(__dirname, 'renderer', 'capture', 'capture.html'));

    captureWindow.webContents.on('did-finish-load', () => {
      // 将截图数据传递给渲染进程
      const imgDataUrl = sources[0].thumbnail.toDataURL();
      captureWindow.webContents.send('capture-screen-data', {
        imageDataUrl: imgDataUrl,
        displays: displays.map(d => ({
          bounds: d.bounds,
          scaleFactor: d.scaleFactor,
        })),
        totalBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      });
    });

    captureWindow.on('closed', () => {
      captureWindow = null;
    });
  } catch (e) {
    console.error('截图失败:', e);
  }
}

// ============ 长截图功能 ============
async function startScrollCapture() {
  // 先执行普通截图，然后在渲染进程中切换到长截图模式
  if (captureWindow) {
    captureWindow.close();
    captureWindow = null;
  }

  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  displays.forEach(d => {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  });

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxX - minX, height: maxY - minY },
    });

    if (sources.length === 0) return;

    captureWindow = new BrowserWindow({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    captureWindow.setAlwaysOnTop(true, 'screen-saver');
    captureWindow.loadFile(path.join(__dirname, 'renderer', 'capture', 'capture.html'));

    captureWindow.webContents.on('did-finish-load', () => {
      const imgDataUrl = sources[0].thumbnail.toDataURL();
      captureWindow.webContents.send('capture-screen-data', {
        imageDataUrl: imgDataUrl,
        displays: displays.map(d => ({
          bounds: d.bounds,
          scaleFactor: d.scaleFactor,
        })),
        totalBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        scrollCaptureMode: true,
      });
    });

    captureWindow.on('closed', () => {
      captureWindow = null;
    });
  } catch (e) {
    console.error('长截图失败:', e);
  }
}

// ============ 贴图功能 ============
function createPinWindow(imageDataUrl, bounds) {
  const pinWin = new BrowserWindow({
    x: bounds?.x || 100,
    y: bounds?.y || 100,
    width: bounds?.width || 400,
    height: bounds?.height || 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pinWin.setAlwaysOnTop(true, 'floating');
  pinWin.loadFile(path.join(__dirname, 'renderer', 'pin', 'pin.html'));

  pinWin.webContents.on('did-finish-load', () => {
    pinWin.webContents.send('pin-image-data', {
      imageDataUrl: imageDataUrl,
      width: bounds?.width || 400,
      height: bounds?.height || 300,
    });
  });

  pinWin.on('closed', () => {
    pinWindows = pinWindows.filter(w => w !== pinWin);
  });

  pinWindows.push(pinWin);
  return pinWin;
}

// ============ OCR 窗口 ============
function openOcrWindow(imageDataUrl) {
  if (ocrWindow) {
    ocrWindow.close();
  }

  ocrWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ocrWindow.loadFile(path.join(__dirname, 'renderer', 'ocr', 'ocr.html'));

  ocrWindow.webContents.on('did-finish-load', () => {
    ocrWindow.webContents.send('ocr-image-data', { imageDataUrl });
  });

  ocrWindow.on('closed', () => {
    ocrWindow = null;
  });
}

// ============ 设置窗口 ============
function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 550,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ============ IPC 通信 ============
function setupIPC() {
  // 关闭截图窗口
  ipcMain.on('capture-cancel', () => {
    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
    }
  });

  // 截图完成 - 复制到剪贴板
  ipcMain.on('capture-copy', (event, { imageDataUrl }) => {
    const img = nativeImage.createFromDataURL(imageDataUrl);
    clipboard.writeImage(img);
    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
    }
  });

  // 截图完成 - 保存文件
  ipcMain.on('capture-save', async (event, { imageDataUrl }) => {
    const format = store?.get('imageFormat') || 'png';
    const savePath = store?.get('savePath') || app.getPath('pictures');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultPath = path.join(savePath, `Pix_${timestamp}.${format}`);

    const result = await dialog.showSaveDialog({
      defaultPath: defaultPath,
      filters: [
        { name: 'PNG 图片', extensions: ['png'] },
        { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] },
        { name: 'WebP 图片', extensions: ['webp'] },
      ],
    });

    if (!result.canceled && result.filePath) {
      const img = nativeImage.createFromDataURL(imageDataUrl);
      const buffer = format === 'jpg' || format === 'jpeg'
        ? img.toJPEG(90)
        : img.toPNG();
      fs.writeFileSync(result.filePath, buffer);
    }

    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
    }
  });

  // 截图完成 - 贴图
  ipcMain.on('capture-pin', (event, { imageDataUrl, bounds }) => {
    createPinWindow(imageDataUrl, bounds);
    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
    }
  });

  // 截图完成 - OCR
  ipcMain.on('capture-ocr', (event, { imageDataUrl }) => {
    openOcrWindow(imageDataUrl);
    if (captureWindow) {
      captureWindow.close();
      captureWindow = null;
    }
  });

  // 关闭贴图窗口
  ipcMain.on('pin-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // 贴图 OCR
  ipcMain.on('pin-ocr', (event, { imageDataUrl }) => {
    openOcrWindow(imageDataUrl);
  });

  // 关闭 OCR 窗口
  ipcMain.on('ocr-close', () => {
    if (ocrWindow) {
      ocrWindow.close();
      ocrWindow = null;
    }
  });

  // 翻译请求
  ipcMain.handle('translate-text', async (event, { text, from, to, engine }) => {
    try {
      if (engine === 'google') {
        const googleTranslate = require('./src/translate/google-translate');
        return await googleTranslate.translate(text, from, to);
      } else {
        const customApi = require('./src/translate/custom-api');
        const apiConfig = store?.get('translate.customApis')?.find(a => a.id === engine);
        if (!apiConfig) throw new Error('翻译 API 配置未找到');
        return await customApi.translate(text, from, to, apiConfig);
      }
    } catch (e) {
      return { error: e.message };
    }
  });

  // OCR 识别
  ipcMain.handle('ocr-recognize', async (event, { imageDataUrl }) => {
    try {
      const ocrEngine = require('./src/ocr/ocr-engine');
      return await ocrEngine.recognize(imageDataUrl);
    } catch (e) {
      return { error: e.message };
    }
  });

  // 获取设置
  ipcMain.handle('get-settings', () => {
    return store?.store || {};
  });

  // 更新设置
  ipcMain.on('update-settings', (event, { key, value }) => {
    store?.set(key, value);
    if (key.startsWith('shortcuts')) {
      registerShortcuts();
    }
  });

  // 关闭设置窗口
  ipcMain.on('settings-close', () => {
    if (settingsWindow) {
      settingsWindow.close();
      settingsWindow = null;
    }
  });

  // 打开设置
  ipcMain.on('open-settings', () => {
    openSettings();
  });

  // 选择保存路径
  ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 复制文本到剪贴板
  ipcMain.on('copy-text', (event, text) => {
    clipboard.writeText(text);
  });

  // 关闭当前窗口
  ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // 长截图 - 执行滚动截图
  ipcMain.handle('scroll-capture-frame', async (event, { region }) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: screen.getPrimaryDisplay().bounds.width,
          height: screen.getPrimaryDisplay().bounds.height,
        },
      });
      if (sources.length === 0) return null;
      return sources[0].thumbnail.toDataURL();
    } catch (e) {
      return null;
    }
  });
}

// ============ 应用启动 ============
app.whenReady().then(async () => {
  await initStore();
  createTray();
  registerShortcuts();
  setupIPC();

  // 隐藏 Dock 图标（macOS）
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
});

app.on('window-all-closed', (e) => {
  // 不退出应用，保持系统托盘
  e.preventDefault?.();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('second-instance', () => {
  // 如果尝试启动第二个实例，弹出截图
  startCapture();
});
