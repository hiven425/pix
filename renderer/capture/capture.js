// Pix 截图 - 渲染进程核心逻辑（交互升级版）
(function () {
  'use strict';

  const canvas = document.getElementById('captureCanvas');
  const ctx = canvas.getContext('2d');
  const sizeInfo = document.getElementById('sizeInfo');
  const sizeText = document.getElementById('sizeText');
  const toolbar = document.getElementById('toolbar');
  const textInput = document.getElementById('textInput');
  const magnifier = document.getElementById('magnifier');
  const magnifierCanvas = document.getElementById('magnifierCanvas');
  const magnifierCtx = magnifierCanvas.getContext('2d');
  const magnifierCoord = document.getElementById('magnifierCoord');
  const magnifierColorDot = document.getElementById('magnifierColorDot');

  // ====== 常量 ======
  const HANDLE_SIZE = 8;
  const MAGNIFIER_ZOOM = 8;     // 放大倍数
  const MAGNIFIER_SIZE = 120;   // 放大镜尺寸
  const SELECTION_BORDER_COLOR = '#1a7aff';
  const SELECTION_BORDER_GLOW = 'rgba(26, 122, 255, 0.3)';

  // ====== 状态管理 ======
  let state = {
    screenImage: null,
    isSelecting: false,
    hasSelection: false,
    startX: 0, startY: 0,
    endX: 0, endY: 0,
    currentTool: null,
    toolColor: '#ff4444',
    strokeWidth: 2,
    annotations: [],
    isDrawing: false,
    drawStart: null,
    penPoints: [],
    scrollCaptureMode: false,
    // 选区拖拽/调整
    isDragging: false,
    dragStartX: 0, dragStartY: 0,
    dragOffsetX: 0, dragOffsetY: 0,
    isResizing: false,
    resizeHandle: -1,
    resizeStartSel: null,
    resizeStartMouse: null,
  };

  // 手柄方向 - 0:左上 1:上 2:右上 3:右 4:右下 5:下 6:左下 7:左
  const HANDLE_CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

  // ====== 初始化 ======
  function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    magnifierCanvas.width = MAGNIFIER_SIZE;
    magnifierCanvas.height = MAGNIFIER_SIZE;

    window.pixAPI.onScreenData((data) => {
      const img = new Image();
      img.onload = () => {
        state.screenImage = img;
        state.scrollCaptureMode = data.scrollCaptureMode || false;
        render();
      };
      img.src = data.imageDataUrl;
    });

    bindEvents();
  }

  // ====== 事件绑定 ======
  function bindEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);
    document.addEventListener('keydown', onKeyDown);

    // 工具栏按钮
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        setActiveTool(tool === state.currentTool ? null : tool);
      });
    });

    // 颜色选择
    document.getElementById('toolColor').addEventListener('input', (e) => {
      state.toolColor = e.target.value;
    });

    // 线宽选择
    document.querySelectorAll('[data-stroke]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.strokeWidth = parseInt(btn.dataset.stroke);
        document.querySelectorAll('[data-stroke]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 操作按钮
    document.getElementById('btnCopy').addEventListener('click', doCopy);
    document.getElementById('btnSave').addEventListener('click', doSave);
    document.getElementById('btnPin').addEventListener('click', doPin);
    document.getElementById('btnOcr').addEventListener('click', doOcr);
    document.getElementById('btnCancel').addEventListener('click', doCancel);
    document.getElementById('btnUndo').addEventListener('click', doUndo);

    // 文字输入
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitTextAnnotation();
      }
      if (e.key === 'Escape') {
        textInput.style.display = 'none';
        textInput.value = '';
      }
    });

    // 右键取消
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (state.currentTool) {
        setActiveTool(null);
      } else if (state.hasSelection) {
        resetSelection();
      } else {
        doCancel();
      }
    });
  }

  // ====== 鼠标事件处理 ======
  function onMouseDown(e) {
    if (e.button !== 0) return;
    const mx = e.clientX, my = e.clientY;

    if (!state.hasSelection) {
      // 开始选区
      state.isSelecting = true;
      state.startX = mx;
      state.startY = my;
      state.endX = mx;
      state.endY = my;
      magnifier.style.display = 'block';
    } else if (state.currentTool) {
      // 开始绘制标注
      const sel = getSelectionRect();
      if (isInsideRect(mx, my, sel)) {
        if (state.currentTool === 'text') {
          showTextInput(mx, my);
          return;
        }
        state.isDrawing = true;
        state.drawStart = { x: mx, y: my };
        if (state.currentTool === 'pen') {
          state.penPoints = [{ x: mx, y: my }];
        }
      }
    } else {
      // 检查是否点击了手柄
      const sel = getSelectionRect();
      const handleIdx = getHandleAtPoint(mx, my, sel);

      if (handleIdx >= 0) {
        // 开始调整选区大小
        state.isResizing = true;
        state.resizeHandle = handleIdx;
        state.resizeStartSel = { ...sel };
        state.resizeStartMouse = { x: mx, y: my };
      } else if (isInsideRect(mx, my, sel)) {
        // 拖拽移动选区
        state.isDragging = true;
        state.dragStartX = mx;
        state.dragStartY = my;
        state.dragOffsetX = state.startX;
        state.dragOffsetY = state.startY;
        canvas.style.cursor = 'move';
      }
    }
  }

  function onMouseMove(e) {
    const mx = e.clientX, my = e.clientY;

    if (state.isSelecting) {
      state.endX = mx;
      state.endY = my;
      updateSizeInfo();
      updateMagnifier(mx, my);
      render();
    } else if (state.isDragging) {
      // 移动选区
      const dx = mx - state.dragStartX;
      const dy = my - state.dragStartY;
      const origW = Math.abs(state.endX - state.startX);
      const origH = Math.abs(state.endY - state.startY);

      const oldSel = {
        x: Math.min(state.dragOffsetX, state.dragOffsetX + (state.endX > state.startX ? origW : -origW)),
        y: Math.min(state.dragOffsetY, state.dragOffsetY + (state.endY > state.startY ? origH : -origH)),
      };

      state.startX = state.dragOffsetX + dx;
      state.startY = state.dragOffsetY + dy;
      state.endX = state.startX + (state.endX > state.startX || dx ? origW : -origW);
      state.endY = state.startY + (state.endY > state.startY || dy ? origH : -origH);

      // 确保选区方向正确
      const newSel = getSelectionRect();
      state.startX = newSel.x;
      state.startY = newSel.y;
      state.endX = newSel.x + newSel.w;
      state.endY = newSel.y + newSel.h;

      updateSizeInfo();
      showToolbar();
      render();
    } else if (state.isResizing) {
      // 调整选区大小
      resizeSelection(mx, my);
      updateSizeInfo();
      showToolbar();
      render();
    } else if (state.isDrawing && state.drawStart) {
      if (state.currentTool === 'pen') {
        state.penPoints.push({ x: mx, y: my });
      }
      render();
      drawAnnotationPreview(state.drawStart, { x: mx, y: my });
    } else if (!state.hasSelection) {
      // 未选区状态 - 显示放大镜和十字线
      render();
      drawCrosshair(mx, my);
      updateMagnifier(mx, my);
      magnifier.style.display = 'block';
    } else {
      // 更新光标（根据手柄位置）
      const sel = getSelectionRect();
      const handleIdx = getHandleAtPoint(mx, my, sel);
      if (handleIdx >= 0) {
        canvas.style.cursor = HANDLE_CURSORS[handleIdx];
      } else if (isInsideRect(mx, my, sel)) {
        canvas.style.cursor = state.currentTool ? (state.currentTool === 'text' ? 'text' : 'crosshair') : 'move';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    }
  }

  function onMouseUp(e) {
    if (state.isSelecting) {
      state.isSelecting = false;
      state.endX = e.clientX;
      state.endY = e.clientY;
      magnifier.style.display = 'none';

      const sel = getSelectionRect();
      if (sel.w > 5 && sel.h > 5) {
        // 规范化选区（确保 start < end）
        state.startX = sel.x;
        state.startY = sel.y;
        state.endX = sel.x + sel.w;
        state.endY = sel.y + sel.h;
        state.hasSelection = true;
        showToolbar();
        canvas.style.cursor = 'move';
      }
      render();
    } else if (state.isDragging) {
      state.isDragging = false;
      canvas.style.cursor = 'move';
    } else if (state.isResizing) {
      state.isResizing = false;
      state.resizeHandle = -1;
      // 规范化选区
      const sel = getSelectionRect();
      state.startX = sel.x;
      state.startY = sel.y;
      state.endX = sel.x + sel.w;
      state.endY = sel.y + sel.h;
    } else if (state.isDrawing && state.drawStart) {
      const end = { x: e.clientX, y: e.clientY };
      commitAnnotation(state.drawStart, end);
      state.isDrawing = false;
      state.drawStart = null;
      state.penPoints = [];
      render();
    }
  }

  // 双击选区 = 复制
  function onDblClick(e) {
    if (state.hasSelection) {
      const sel = getSelectionRect();
      if (isInsideRect(e.clientX, e.clientY, sel)) {
        doCopy();
      }
    }
  }

  // ====== 键盘事件 ======
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (state.currentTool) {
        setActiveTool(null);
      } else if (state.hasSelection) {
        resetSelection();
      } else {
        doCancel();
      }
    }
    if (e.key === 'Enter' && state.hasSelection) {
      doCopy();
    }
    if (e.ctrlKey && e.key === 'z') {
      doUndo();
    }
    // Ctrl+C = 复制
    if (e.ctrlKey && e.key === 'c' && state.hasSelection) {
      doCopy();
    }
    // Ctrl+S = 保存
    if (e.ctrlKey && e.key === 's' && state.hasSelection) {
      e.preventDefault();
      doSave();
    }
  }

  // ====== 渲染 ======
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.screenImage) return;

    // 绘制屏幕截图
    ctx.drawImage(state.screenImage, 0, 0, canvas.width, canvas.height);

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.isSelecting || state.hasSelection) {
      const sel = getSelectionRect();

      // 选区内显示原始截图
      ctx.save();
      ctx.beginPath();
      ctx.rect(sel.x, sel.y, sel.w, sel.h);
      ctx.clip();
      ctx.drawImage(state.screenImage, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // 绘制已有标注
      drawAnnotations();

      // 选区边框 - 双线效果（外发光 + 实线）
      ctx.save();
      // 外发光
      ctx.shadowColor = SELECTION_BORDER_GLOW;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = SELECTION_BORDER_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      ctx.restore();

      // 选区四角和边中点手柄
      if (state.hasSelection) {
        drawResizeHandles(sel);
      }

      // 虚线参考线（延伸到屏幕边缘）
      if (state.isSelecting) {
        drawExtensionLines(sel);
      }
    }
  }

  // ====== 选区相关 ======
  function getSelectionRect() {
    const x = Math.min(state.startX, state.endX);
    const y = Math.min(state.startY, state.endY);
    const w = Math.abs(state.endX - state.startX);
    const h = Math.abs(state.endY - state.startY);
    return { x, y, w, h };
  }

  function isInsideRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function resetSelection() {
    state.hasSelection = false;
    state.isSelecting = false;
    state.annotations = [];
    state.currentTool = null;
    toolbar.style.display = 'none';
    sizeInfo.style.display = 'none';
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
    canvas.style.cursor = 'crosshair';
    render();
  }

  // ====== 手柄检测和选区调整 ======
  function getHandlePositions(sel) {
    const s = HANDLE_SIZE;
    return [
      { x: sel.x - s/2, y: sel.y - s/2 },                       // 0: 左上
      { x: sel.x + sel.w/2 - s/2, y: sel.y - s/2 },             // 1: 上
      { x: sel.x + sel.w - s/2, y: sel.y - s/2 },               // 2: 右上
      { x: sel.x + sel.w - s/2, y: sel.y + sel.h/2 - s/2 },     // 3: 右
      { x: sel.x + sel.w - s/2, y: sel.y + sel.h - s/2 },       // 4: 右下
      { x: sel.x + sel.w/2 - s/2, y: sel.y + sel.h - s/2 },     // 5: 下
      { x: sel.x - s/2, y: sel.y + sel.h - s/2 },               // 6: 左下
      { x: sel.x - s/2, y: sel.y + sel.h/2 - s/2 },             // 7: 左
    ];
  }

  function getHandleAtPoint(px, py, sel) {
    const handles = getHandlePositions(sel);
    const hitSize = HANDLE_SIZE + 4; // 增大点击区域
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      if (px >= h.x - 2 && px <= h.x + hitSize && py >= h.y - 2 && py <= h.y + hitSize) {
        return i;
      }
    }
    return -1;
  }

  function resizeSelection(mx, my) {
    const h = state.resizeHandle;
    const s = state.resizeStartSel;
    const dm = state.resizeStartMouse;
    const dx = mx - dm.x;
    const dy = my - dm.y;

    switch (h) {
      case 0: // 左上
        state.startX = s.x + dx;
        state.startY = s.y + dy;
        state.endX = s.x + s.w;
        state.endY = s.y + s.h;
        break;
      case 1: // 上
        state.startY = s.y + dy;
        break;
      case 2: // 右上
        state.startY = s.y + dy;
        state.endX = s.x + s.w + dx;
        break;
      case 3: // 右
        state.endX = s.x + s.w + dx;
        break;
      case 4: // 右下
        state.endX = s.x + s.w + dx;
        state.endY = s.y + s.h + dy;
        break;
      case 5: // 下
        state.endY = s.y + s.h + dy;
        break;
      case 6: // 左下
        state.startX = s.x + dx;
        state.endY = s.y + s.h + dy;
        break;
      case 7: // 左
        state.startX = s.x + dx;
        break;
    }
  }

  // ====== 尺寸信息 ======
  function updateSizeInfo() {
    const sel = getSelectionRect();
    sizeText.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
    sizeInfo.style.display = 'block';

    let infoX = sel.x;
    let infoY = sel.y - 30;

    if (infoY < 0) {
      infoY = sel.y + sel.h + 6;
    }

    sizeInfo.style.left = `${infoX}px`;
    sizeInfo.style.top = `${infoY}px`;
  }

  // ====== 放大镜 ======
  function updateMagnifier(mx, my) {
    if (!state.screenImage) return;

    // 放大镜位置（固定偏移在鼠标右下方）
    let magX = mx + 20;
    let magY = my + 20;

    // 边界检测
    if (magX + MAGNIFIER_SIZE > canvas.width) magX = mx - MAGNIFIER_SIZE - 20;
    if (magY + MAGNIFIER_SIZE > canvas.height) magY = my - MAGNIFIER_SIZE - 20;
    if (magX < 0) magX = mx + 20;
    if (magY < 0) magY = my + 20;

    magnifier.style.left = `${magX}px`;
    magnifier.style.top = `${magY}px`;

    // 绘制放大区域
    const srcSize = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
    magnifierCtx.imageSmoothingEnabled = false;
    magnifierCtx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    magnifierCtx.drawImage(
      state.screenImage,
      mx - srcSize / 2, my - srcSize / 2, srcSize, srcSize,
      0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE
    );

    // 绘制网格线
    magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    magnifierCtx.lineWidth = 0.5;
    for (let i = 0; i < MAGNIFIER_SIZE; i += MAGNIFIER_ZOOM) {
      magnifierCtx.beginPath();
      magnifierCtx.moveTo(i, 0);
      magnifierCtx.lineTo(i, MAGNIFIER_SIZE);
      magnifierCtx.stroke();
      magnifierCtx.beginPath();
      magnifierCtx.moveTo(0, i);
      magnifierCtx.lineTo(MAGNIFIER_SIZE, i);
      magnifierCtx.stroke();
    }

    // 坐标和颜色
    magnifierCoord.textContent = `${mx}, ${my}`;

    // 获取像素颜色
    try {
      const pixel = ctx.getImageData(mx, my, 1, 1).data;
      const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
      magnifierColorDot.style.background = hex;
    } catch (e) {
      // 忽略跨域等错误
    }
  }

  // ====== 工具栏 ======
  function showToolbar() {
    const sel = getSelectionRect();
    toolbar.style.display = 'flex';

    // 定位在选区右下方
    const toolbarWidth = toolbar.offsetWidth || 350;
    const toolbarHeight = toolbar.offsetHeight || 72;

    let toolbarX = sel.x + sel.w - toolbarWidth;
    let toolbarY = sel.y + sel.h + 8;

    // 超出底部则放上方
    if (toolbarY + toolbarHeight > canvas.height) {
      toolbarY = sel.y - toolbarHeight - 8;
    }

    // 边界约束
    if (toolbarX < 4) toolbarX = 4;
    if (toolbarX + toolbarWidth > canvas.width - 4) {
      toolbarX = canvas.width - toolbarWidth - 4;
    }
    if (toolbarY < 4) toolbarY = sel.y + sel.h + 8;

    toolbar.style.left = `${toolbarX}px`;
    toolbar.style.top = `${toolbarY}px`;

    updateSizeInfo();
  }

  // ====== 标注工具 ======
  function setActiveTool(tool) {
    state.currentTool = tool;
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // 显示/隐藏标注工具行
    const annotationRow = document.getElementById('toolbarAnnotation');
    if (annotationRow) {
      // 标注行始终显示
    }

    if (tool) {
      canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
    } else {
      canvas.style.cursor = state.hasSelection ? 'move' : 'crosshair';
    }
  }

  function drawAnnotationPreview(start, end) {
    const sel = getSelectionRect();

    ctx.save();
    ctx.beginPath();
    ctx.rect(sel.x, sel.y, sel.w, sel.h);
    ctx.clip();

    ctx.strokeStyle = state.toolColor;
    ctx.fillStyle = state.toolColor;
    ctx.lineWidth = state.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (state.currentTool) {
      case 'rect':
        ctx.strokeRect(
          Math.min(start.x, end.x), Math.min(start.y, end.y),
          Math.abs(end.x - start.x), Math.abs(end.y - start.y)
        );
        break;
      case 'ellipse': {
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arrow':
        drawArrow(ctx, start.x, start.y, end.x, end.y);
        break;
      case 'pen':
        if (state.penPoints.length > 1) {
          drawSmoothLine(ctx, state.penPoints);
        }
        break;
      case 'mosaic':
        drawMosaic(start, end);
        break;
    }
    ctx.restore();
  }

  function commitAnnotation(start, end) {
    state.annotations.push({
      type: state.currentTool,
      start: { ...start },
      end: { ...end },
      color: state.toolColor,
      strokeWidth: state.strokeWidth,
      penPoints: state.currentTool === 'pen' ? [...state.penPoints] : null,
    });
  }

  function drawAnnotations() {
    const sel = getSelectionRect();

    ctx.save();
    ctx.beginPath();
    ctx.rect(sel.x, sel.y, sel.w, sel.h);
    ctx.clip();

    state.annotations.forEach(ann => {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (ann.type) {
        case 'rect':
          ctx.strokeRect(
            Math.min(ann.start.x, ann.end.x), Math.min(ann.start.y, ann.end.y),
            Math.abs(ann.end.x - ann.start.x), Math.abs(ann.end.y - ann.start.y)
          );
          break;
        case 'ellipse': {
          const cx = (ann.start.x + ann.end.x) / 2;
          const cy = (ann.start.y + ann.end.y) / 2;
          const rx = Math.abs(ann.end.x - ann.start.x) / 2;
          const ry = Math.abs(ann.end.y - ann.start.y) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'arrow':
          drawArrow(ctx, ann.start.x, ann.start.y, ann.end.x, ann.end.y);
          break;
        case 'pen':
          if (ann.penPoints && ann.penPoints.length > 1) {
            drawSmoothLine(ctx, ann.penPoints);
          }
          break;
        case 'mosaic':
          drawMosaic(ann.start, ann.end);
          break;
        case 'text':
          ctx.font = `${ann.strokeWidth * 7 + 10}px "Microsoft YaHei", "Segoe UI", sans-serif`;
          ctx.fillText(ann.text, ann.start.x, ann.start.y);
          break;
      }
    });

    ctx.restore();
  }

  // ====== 辅助绘图 ======
  function drawArrow(ctx, x1, y1, x2, y2) {
    const headLen = 10 + state.strokeWidth * 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // 箭杆
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 箭头 - 实心三角形
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 7),
      y2 - headLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      x2 - headLen * 0.6 * Math.cos(angle),
      y2 - headLen * 0.6 * Math.sin(angle)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 7),
      y2 - headLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
  }

  // 平滑曲线绘制（贝塞尔）
  function drawSmoothLine(ctx, points) {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  function drawMosaic(start, end) {
    const blockSize = 8 + state.strokeWidth;
    const sx = Math.min(start.x, end.x);
    const sy = Math.min(start.y, end.y);
    const sw = Math.abs(end.x - start.x);
    const sh = Math.abs(end.y - start.y);

    for (let x = sx; x < sx + sw; x += blockSize) {
      for (let y = sy; y < sy + sh; y += blockSize) {
        try {
          const pixel = ctx.getImageData(
            Math.min(x + blockSize / 2, canvas.width - 1),
            Math.min(y + blockSize / 2, canvas.height - 1),
            1, 1
          ).data;
          ctx.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          ctx.fillRect(x, y, blockSize, blockSize);
        } catch (e) { /* 忽略 */ }
      }
    }
  }

  function drawCrosshair(x, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(26, 122, 255, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([5, 3]);

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    ctx.restore();
  }

  // 选区延伸参考线
  function drawExtensionLines(sel) {
    ctx.save();
    ctx.strokeStyle = 'rgba(26, 122, 255, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);

    // 上边延伸
    ctx.beginPath();
    ctx.moveTo(0, sel.y);
    ctx.lineTo(sel.x, sel.y);
    ctx.moveTo(sel.x + sel.w, sel.y);
    ctx.lineTo(canvas.width, sel.y);
    ctx.stroke();

    // 下边延伸
    ctx.beginPath();
    ctx.moveTo(0, sel.y + sel.h);
    ctx.lineTo(sel.x, sel.y + sel.h);
    ctx.moveTo(sel.x + sel.w, sel.y + sel.h);
    ctx.lineTo(canvas.width, sel.y + sel.h);
    ctx.stroke();

    // 左边延伸
    ctx.beginPath();
    ctx.moveTo(sel.x, 0);
    ctx.lineTo(sel.x, sel.y);
    ctx.moveTo(sel.x, sel.y + sel.h);
    ctx.lineTo(sel.x, canvas.height);
    ctx.stroke();

    // 右边延伸
    ctx.beginPath();
    ctx.moveTo(sel.x + sel.w, 0);
    ctx.lineTo(sel.x + sel.w, sel.y);
    ctx.moveTo(sel.x + sel.w, sel.y + sel.h);
    ctx.lineTo(sel.x + sel.w, canvas.height);
    ctx.stroke();

    ctx.restore();
  }

  function drawResizeHandles(sel) {
    const handles = getHandlePositions(sel);

    handles.forEach((h, i) => {
      // 角点用圆形，边点用方形
      const isCorner = i % 2 === 0;

      ctx.fillStyle = '#fff';
      ctx.strokeStyle = SELECTION_BORDER_COLOR;
      ctx.lineWidth = 1.5;

      if (isCorner) {
        const r = HANDLE_SIZE / 2;
        ctx.beginPath();
        ctx.arc(h.x + r, h.y + r, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const inset = 1;
        ctx.fillRect(h.x + inset, h.y + inset, HANDLE_SIZE - inset * 2, HANDLE_SIZE - inset * 2);
        ctx.strokeRect(h.x + inset, h.y + inset, HANDLE_SIZE - inset * 2, HANDLE_SIZE - inset * 2);
      }
    });
  }

  // ====== 文字标注 ======
  function showTextInput(x, y) {
    textInput.style.display = 'block';
    textInput.style.left = `${x}px`;
    textInput.style.top = `${y}px`;
    textInput.style.color = state.toolColor;
    textInput.style.fontSize = `${state.strokeWidth * 7 + 10}px`;
    textInput.value = '';
    textInput.focus();
    state._textPos = { x, y: y + parseInt(textInput.style.fontSize) };
  }

  function commitTextAnnotation() {
    const text = textInput.value.trim();
    if (text && state._textPos) {
      state.annotations.push({
        type: 'text',
        start: { ...state._textPos },
        end: { ...state._textPos },
        color: state.toolColor,
        strokeWidth: state.strokeWidth,
        text: text,
      });
    }
    textInput.style.display = 'none';
    textInput.value = '';
    render();
  }

  // ====== 获取选区图像 ======
  function getSelectionImageDataUrl() {
    const sel = getSelectionRect();
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sel.w;
    tempCanvas.height = sel.h;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(
      state.screenImage,
      sel.x, sel.y, sel.w, sel.h,
      0, 0, sel.w, sel.h
    );

    // 绘制标注
    tempCtx.save();
    state.annotations.forEach(ann => {
      tempCtx.strokeStyle = ann.color;
      tempCtx.fillStyle = ann.color;
      tempCtx.lineWidth = ann.strokeWidth || 2;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';

      const ox = -sel.x, oy = -sel.y;

      switch (ann.type) {
        case 'rect':
          tempCtx.strokeRect(
            Math.min(ann.start.x, ann.end.x) + ox,
            Math.min(ann.start.y, ann.end.y) + oy,
            Math.abs(ann.end.x - ann.start.x),
            Math.abs(ann.end.y - ann.start.y)
          );
          break;
        case 'ellipse': {
          const cx = (ann.start.x + ann.end.x) / 2 + ox;
          const cy = (ann.start.y + ann.end.y) / 2 + oy;
          const rx = Math.abs(ann.end.x - ann.start.x) / 2;
          const ry = Math.abs(ann.end.y - ann.start.y) / 2;
          tempCtx.beginPath();
          tempCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          tempCtx.stroke();
          break;
        }
        case 'arrow':
          drawArrow(tempCtx,
            ann.start.x + ox, ann.start.y + oy,
            ann.end.x + ox, ann.end.y + oy
          );
          break;
        case 'pen':
          if (ann.penPoints && ann.penPoints.length > 1) {
            const offsetPoints = ann.penPoints.map(p => ({ x: p.x + ox, y: p.y + oy }));
            drawSmoothLine(tempCtx, offsetPoints);
          }
          break;
        case 'text':
          tempCtx.font = `${(ann.strokeWidth || 2) * 7 + 10}px "Microsoft YaHei", "Segoe UI", sans-serif`;
          tempCtx.fillText(ann.text, ann.start.x + ox, ann.start.y + oy);
          break;
      }
    });
    tempCtx.restore();

    return tempCanvas.toDataURL('image/png');
  }

  // ====== 操作按钮处理 ======
  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('hide');
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
    }, 600);
  }

  function doCopy() {
    if (!state.hasSelection) return;
    const dataUrl = getSelectionImageDataUrl();
    window.pixAPI.copyCapture(dataUrl);
    showToast('✅ 已复制到剪贴板');
  }

  function doSave() {
    if (!state.hasSelection) return;
    const dataUrl = getSelectionImageDataUrl();
    window.pixAPI.saveCapture(dataUrl);
  }

  function doPin() {
    if (!state.hasSelection) return;
    const sel = getSelectionRect();
    const dataUrl = getSelectionImageDataUrl();
    window.pixAPI.pinCapture(dataUrl, {
      x: sel.x,
      y: sel.y,
      width: sel.w,
      height: sel.h,
    });
  }

  function doOcr() {
    if (!state.hasSelection) return;
    const dataUrl = getSelectionImageDataUrl();
    window.pixAPI.ocrCapture(dataUrl);
  }

  function doCancel() {
    window.pixAPI.cancelCapture();
  }

  function doUndo() {
    if (state.annotations.length > 0) {
      state.annotations.pop();
      render();
    }
  }

  // ====== 启动 ======
  init();
})();
