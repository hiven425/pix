// Pix 设置持久化管理
// 使用 electron-store 管理应用配置

/**
 * 默认配置项
 */
const DEFAULT_SETTINGS = {
  shortcuts: {
    capture: 'Ctrl+Alt+A',
    scrollCapture: 'Ctrl+Alt+S',
  },
  savePath: '', // 由主进程在初始化时设定
  imageFormat: 'png',
  autoStart: false,
  translate: {
    defaultEngine: 'google',
    google: {
      enabled: true,
    },
    customApis: [],
  },
};

module.exports = { DEFAULT_SETTINGS };
