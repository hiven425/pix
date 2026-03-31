// Pix OCR 结果页 - 渲染进程
(function () {
  'use strict';

  const loadingState = document.getElementById('loadingState');
  const resultState = document.getElementById('resultState');
  const errorState = document.getElementById('errorState');
  const progressFill = document.getElementById('progressFill');
  const resultText = document.getElementById('resultText');
  const confidenceBadge = document.getElementById('confidenceBadge');
  const translatePanel = document.getElementById('translatePanel');
  const translateLoading = document.getElementById('translateLoading');
  const translateText = document.getElementById('translateText');
  const translateTo = document.getElementById('translateTo');
  const errorText = document.getElementById('errorText');

  let currentImageDataUrl = '';
  let recognizedText = '';

  // ====== 初始化 ======
  window.pixAPI.onOcrImageData(async (data) => {
    currentImageDataUrl = data.imageDataUrl;
    await performOcr();
  });

  // ====== OCR 识别 ======
  async function performOcr() {
    showLoading();

    // 模拟进度条（实际进度由主进程控制）
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 90);
      progressFill.style.width = `${progress}%`;
    }, 300);

    try {
      const result = await window.pixAPI.recognizeOcr(currentImageDataUrl);

      clearInterval(progressTimer);
      progressFill.style.width = '100%';

      if (result.error) {
        showError(result.error);
        return;
      }

      recognizedText = result.text || '';
      const confidence = result.confidence || 0;

      // 显示结果
      setTimeout(() => {
        showResult(recognizedText, confidence);
      }, 200);
    } catch (e) {
      clearInterval(progressTimer);
      showError(e.message || '识别过程出错');
    }
  }

  // ====== 状态切换 ======
  function showLoading() {
    loadingState.style.display = 'flex';
    resultState.style.display = 'none';
    errorState.style.display = 'none';
    progressFill.style.width = '0%';
  }

  function showResult(text, confidence) {
    loadingState.style.display = 'none';
    resultState.style.display = 'flex';
    errorState.style.display = 'none';

    resultText.value = text;
    confidenceBadge.textContent = `置信度: ${Math.round(confidence)}%`;

    // 根据置信度设置颜色
    if (confidence >= 80) {
      confidenceBadge.style.color = 'var(--color-success)';
    } else if (confidence >= 50) {
      confidenceBadge.style.color = 'var(--color-warning)';
    } else {
      confidenceBadge.style.color = 'var(--color-danger)';
    }
  }

  function showError(msg) {
    loadingState.style.display = 'none';
    resultState.style.display = 'none';
    errorState.style.display = 'flex';
    errorText.textContent = msg || '识别失败';
  }

  // ====== 按钮事件 ======
  document.getElementById('btnClose').addEventListener('click', () => {
    window.pixAPI.closeOcr();
  });

  document.getElementById('btnCopyAll').addEventListener('click', () => {
    window.pixAPI.copyText(recognizedText);
    // 视觉反馈
    const btn = document.getElementById('btnCopyAll');
    btn.textContent = '✅ 已复制';
    setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
  });

  document.getElementById('btnTranslate').addEventListener('click', async () => {
    translatePanel.style.display = 'flex';
    await doTranslate();
  });

  document.getElementById('btnCopyTranslation').addEventListener('click', () => {
    window.pixAPI.copyText(translateText.value);
    const btn = document.getElementById('btnCopyTranslation');
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = '📋'; }, 1500);
  });

  translateTo.addEventListener('change', () => {
    doTranslate();
  });

  document.getElementById('btnRetry').addEventListener('click', () => {
    performOcr();
  });

  // ====== 翻译 ======
  async function doTranslate() {
    if (!recognizedText.trim()) return;

    translateLoading.style.display = 'block';
    translateText.value = '';

    try {
      const result = await window.pixAPI.translateText(
        recognizedText,
        'auto',
        translateTo.value,
        'google'
      );

      translateLoading.style.display = 'none';

      if (result.error) {
        translateText.value = `翻译失败: ${result.error}`;
      } else {
        translateText.value = result.text;
      }
    } catch (e) {
      translateLoading.style.display = 'none';
      translateText.value = `翻译出错: ${e.message}`;
    }
  }

  // ====== 键盘快捷键 ======
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.pixAPI.closeOcr();
    }
    if (e.ctrlKey && e.key === 'c' && !window.getSelection()?.toString()) {
      window.pixAPI.copyText(recognizedText);
    }
  });
})();
