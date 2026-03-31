// Pix OCR 引擎 - Tesseract.js 封装
const Tesseract = require('tesseract.js');
const path = require('path');

let worker = null;

/**
 * 初始化 OCR Worker
 * @param {string[]} langs - 语言列表，如 ['chi_sim', 'eng']
 */
async function initWorker(langs = ['chi_sim', 'eng']) {
  if (worker) {
    await worker.terminate();
  }

  worker = await Tesseract.createWorker(langs.join('+'), 1, {
    // 使用 CDN 加载语言包（可配置本地路径）
    logger: (m) => {
      if (m.status === 'recognizing text') {
        // 进度回调可通过 IPC 传递到渲染进程
      }
    },
  });
}

/**
 * OCR 识别
 * @param {string} imageDataUrl - 图像的 DataURL
 * @returns {Promise<{text: string, confidence: number, blocks: Array}>}
 */
async function recognize(imageDataUrl) {
  try {
    if (!worker) {
      await initWorker();
    }

    // 将 DataURL 转为 Buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const { data } = await worker.recognize(buffer);

    return {
      text: data.text.trim(),
      confidence: data.confidence,
      blocks: data.blocks?.map(block => ({
        text: block.text,
        confidence: block.confidence,
        bbox: block.bbox,
      })) || [],
    };
  } catch (error) {
    console.error('OCR 识别失败:', error);
    return { error: error.message };
  }
}

/**
 * 释放资源
 */
async function terminate() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = {
  recognize,
  terminate,
  initWorker,
};
