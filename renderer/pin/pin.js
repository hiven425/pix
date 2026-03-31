// Pix 贴图窗口 - 渲染进程
(function () {
  'use strict';

  const container = document.getElementById('pinContainer');
  const pinImage = document.getElementById('pinImage');
  const infoOverlay = document.getElementById('infoOverlay');
  const infoText = document.getElementById('infoText');

  let imageDataUrl = '';
  let scale = 1;
  let opacity = 1;
  let infoTimer = null;
  let contextMenu = null;

  // ====== 初始化 ======
  window.pixAPI.onPinImageData((data) => {
    imageDataUrl = data.imageDataUrl;
    pinImage.src = data.imageDataUrl;
  });

  // ====== 滚轮缩放/透明度 ======
  container.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (e.ctrlKey) {
      // Ctrl + 滚轮 = 调整透明度
      opacity += e.deltaY > 0 ? -0.05 : 0.05;
      opacity = Math.max(0.1, Math.min(1, opacity));
      container.style.opacity = opacity;
      showInfo(`透明度: ${Math.round(opacity * 100)}%`);
    } else {
      // 滚轮 = 缩放
      scale += e.deltaY > 0 ? -0.1 : 0.1;
      scale = Math.max(0.2, Math.min(5, scale));
      pinImage.style.transform = `scale(${scale})`;
      showInfo(`${Math.round(scale * 100)}%`);
    }
  });

  // ====== 双击关闭 ======
  container.addEventListener('dblclick', () => {
    window.pixAPI.closePin();
  });

  // ====== 右键菜单 ======
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  function showContextMenu(x, y) {
    removeContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
      <button class="context-menu-item" data-action="copy">📋 复制图片</button>
      <button class="context-menu-item" data-action="save">💾 保存图片</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" data-action="ocr">🔤 OCR 识别</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item" data-action="reset">🔄 重置大小</button>
      <button class="context-menu-item" data-action="resetOpacity">💡 重置透明度</button>
      <div class="context-menu-separator"></div>
      <button class="context-menu-item danger" data-action="close">✕ 关闭</button>
    `;

    document.body.appendChild(contextMenu);

    // 确保菜单不超出窗口
    const rect = contextMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 5;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 5;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // 菜单项点击
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      switch (action) {
        case 'copy':
          window.pixAPI.copyText(''); // 占位，主进程会通过 IPC 处理
          // 直接通过 IPC 复制图像
          window.pixAPI.copyCapture(imageDataUrl);
          showInfo('已复制');
          break;
        case 'save':
          window.pixAPI.saveCapture(imageDataUrl);
          break;
        case 'ocr':
          window.pixAPI.pinOcr(imageDataUrl);
          break;
        case 'reset':
          scale = 1;
          pinImage.style.transform = `scale(1)`;
          showInfo('100%');
          break;
        case 'resetOpacity':
          opacity = 1;
          container.style.opacity = 1;
          showInfo('透明度: 100%');
          break;
        case 'close':
          window.pixAPI.closePin();
          break;
      }
      removeContextMenu();
    });

    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', removeContextMenu, { once: true });
    }, 10);
  }

  function removeContextMenu() {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  }

  // ====== 信息提示 ======
  function showInfo(text) {
    infoText.textContent = text;
    infoOverlay.style.display = 'block';

    clearTimeout(infoTimer);
    infoTimer = setTimeout(() => {
      infoOverlay.style.display = 'none';
    }, 1000);
  }
})();
