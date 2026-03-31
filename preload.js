// Pix 截图工具 - 预加载脚本（IPC 桥接）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixAPI', {
  // ====== 截图相关 ======
  onScreenData: (callback) => ipcRenderer.on('capture-screen-data', (event, data) => callback(data)),
  cancelCapture: () => ipcRenderer.send('capture-cancel'),
  copyCapture: (imageDataUrl) => ipcRenderer.send('capture-copy', { imageDataUrl }),
  saveCapture: (imageDataUrl) => ipcRenderer.send('capture-save', { imageDataUrl }),
  pinCapture: (imageDataUrl, bounds) => ipcRenderer.send('capture-pin', { imageDataUrl, bounds }),
  ocrCapture: (imageDataUrl) => ipcRenderer.send('capture-ocr', { imageDataUrl }),

  // ====== 长截图相关 ======
  scrollCaptureFrame: (region) => ipcRenderer.invoke('scroll-capture-frame', { region }),

  // ====== 贴图相关 ======
  onPinImageData: (callback) => ipcRenderer.on('pin-image-data', (event, data) => callback(data)),
  closePin: () => ipcRenderer.send('pin-close'),
  pinOcr: (imageDataUrl) => ipcRenderer.send('pin-ocr', { imageDataUrl }),

  // ====== OCR 相关 ======
  onOcrImageData: (callback) => ipcRenderer.on('ocr-image-data', (event, data) => callback(data)),
  recognizeOcr: (imageDataUrl) => ipcRenderer.invoke('ocr-recognize', { imageDataUrl }),
  closeOcr: () => ipcRenderer.send('ocr-close'),

  // ====== 翻译相关 ======
  translateText: (text, from, to, engine) => ipcRenderer.invoke('translate-text', { text, from, to, engine }),

  // ====== 设置相关 ======
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (key, value) => ipcRenderer.send('update-settings', { key, value }),
  closeSettings: () => ipcRenderer.send('settings-close'),
  openSettings: () => ipcRenderer.send('open-settings'),
  selectSavePath: () => ipcRenderer.invoke('select-save-path'),

  // ====== 通用 ======
  copyText: (text) => ipcRenderer.send('copy-text', text),
  closeWindow: () => ipcRenderer.send('close-window'),
});
