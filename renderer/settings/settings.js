// Pix 设置页 - 渲染进程
(function () {
  'use strict';

  let settings = {};
  let editingApiIndex = -1;

  // ====== 初始化 ======
  async function init() {
    settings = await window.pixAPI.getSettings();
    loadSettings();
    bindEvents();
  }

  // ====== 加载设置到 UI ======
  function loadSettings() {
    // 通用
    document.getElementById('savePath').value = settings.savePath || '';
    document.getElementById('imageFormat').value = settings.imageFormat || 'png';

    const autoStartBtn = document.getElementById('autoStart');
    if (settings.autoStart) autoStartBtn.classList.add('active');

    // 快捷键
    document.getElementById('shortcutCapture').value = settings.shortcuts?.capture || 'Ctrl+Alt+A';
    document.getElementById('shortcutScrollCapture').value = settings.shortcuts?.scrollCapture || 'Ctrl+Alt+S';

    // 翻译
    document.getElementById('defaultEngine').value = settings.translate?.defaultEngine || 'google';
    renderApiList();
    updateEngineSelector();
  }

  // ====== 事件绑定 ======
  function bindEvents() {
    // Tab 切换
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });

    // 关闭
    document.getElementById('btnClose').addEventListener('click', () => {
      window.pixAPI.closeSettings();
    });

    // 保存路径
    document.getElementById('btnBrowsePath').addEventListener('click', async () => {
      const newPath = await window.pixAPI.selectSavePath();
      if (newPath) {
        document.getElementById('savePath').value = newPath;
        window.pixAPI.updateSettings('savePath', newPath);
      }
    });

    // 图片格式
    document.getElementById('imageFormat').addEventListener('change', (e) => {
      window.pixAPI.updateSettings('imageFormat', e.target.value);
    });

    // 开机自启动
    document.getElementById('autoStart').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.classList.toggle('active');
      const isActive = btn.classList.contains('active');
      window.pixAPI.updateSettings('autoStart', isActive);
    });

    // 快捷键录制
    setupShortcutInput('shortcutCapture', 'shortcuts.capture');
    setupShortcutInput('shortcutScrollCapture', 'shortcuts.scrollCapture');

    // 默认翻译引擎
    document.getElementById('defaultEngine').addEventListener('change', (e) => {
      window.pixAPI.updateSettings('translate.defaultEngine', e.target.value);
    });

    // 添加 API
    document.getElementById('btnAddApi').addEventListener('click', () => {
      editingApiIndex = -1;
      clearApiForm();
      document.getElementById('apiForm').style.display = 'block';
    });

    // API 模板切换
    document.getElementById('apiTemplate').addEventListener('change', (e) => {
      applyApiTemplate(e.target.value);
    });

    // 保存 API
    document.getElementById('btnSaveApi').addEventListener('click', saveApi);
    document.getElementById('btnCancelApi').addEventListener('click', () => {
      document.getElementById('apiForm').style.display = 'none';
    });
  }

  // ====== 快捷键录制 ======
  function setupShortcutInput(inputId, settingsKey) {
    const input = document.getElementById(inputId);
    let recording = false;

    input.addEventListener('click', () => {
      recording = true;
      input.classList.add('recording');
      input.value = '请按下快捷键...';
    });

    input.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault();

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');

      // 排除修饰键本身
      const keyName = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(keyName)) {
        keys.push(keyName.length === 1 ? keyName.toUpperCase() : keyName);

        const shortcut = keys.join('+');
        input.value = shortcut;
        input.classList.remove('recording');
        recording = false;

        window.pixAPI.updateSettings(settingsKey, shortcut);
      }
    });

    input.addEventListener('blur', () => {
      if (recording) {
        input.classList.remove('recording');
        recording = false;
        // 恢复原始值
        const parts = settingsKey.split('.');
        let val = settings;
        for (const p of parts) val = val?.[p];
        input.value = val || '';
      }
    });
  }

  // ====== API 管理 ======
  function renderApiList() {
    const container = document.getElementById('customApiList');
    const apis = settings.translate?.customApis || [];

    container.innerHTML = apis.map((api, index) => `
      <div class="api-card">
        <div class="api-card-info">
          <span class="api-card-name">${escapeHtml(api.name)}</span>
          <span class="api-card-url">${escapeHtml(api.url || '')}</span>
        </div>
        <div class="api-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="editApi(${index})">✏️ 编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deleteApi(${index})">🗑️ 删除</button>
        </div>
      </div>
    `).join('');
  }

  function updateEngineSelector() {
    const selector = document.getElementById('defaultEngine');
    const apis = settings.translate?.customApis || [];

    // 清除自定义选项（保留 google）
    while (selector.options.length > 1) {
      selector.remove(1);
    }

    apis.forEach(api => {
      const option = document.createElement('option');
      option.value = api.id;
      option.textContent = api.name;
      selector.appendChild(option);
    });

    selector.value = settings.translate?.defaultEngine || 'google';
  }

  function clearApiForm() {
    document.getElementById('apiName').value = '';
    document.getElementById('apiTemplate').value = '';
    document.getElementById('apiKey').value = '';
    document.getElementById('apiUrl').value = '';
    document.getElementById('apiMethod').value = 'POST';
    document.getElementById('apiHeaders').value = '';
    document.getElementById('apiBody').value = '';
    document.getElementById('apiResponsePath').value = '';
  }

  function applyApiTemplate(templateName) {
    // 从内置模板填充表单
    const templates = {
      deepl: {
        url: 'https://api-free.deepl.com/v2/translate',
        method: 'POST',
        headers: JSON.stringify({ 'Content-Type': 'application/json', 'Authorization': 'DeepL-Auth-Key {{apiKey}}' }, null, 2),
        body: '{"text":["{{text}}"],"source_lang":"{{from}}","target_lang":"{{to}}"}',
        responsePath: 'translations.0.text',
      },
      openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: JSON.stringify({ 'Content-Type': 'application/json', 'Authorization': 'Bearer {{apiKey}}' }, null, 2),
        body: '{"model":"gpt-3.5-turbo","messages":[{"role":"system","content":"Translate from {{from}} to {{to}}. Return only the translation."},{"role":"user","content":"{{text}}"}]}',
        responsePath: 'choices.0.message.content',
      },
    };

    const tmpl = templates[templateName];
    if (tmpl) {
      if (!document.getElementById('apiName').value) {
        document.getElementById('apiName').value = templateName === 'deepl' ? 'DeepL' : 'OpenAI';
      }
      document.getElementById('apiUrl').value = tmpl.url;
      document.getElementById('apiMethod').value = tmpl.method;
      document.getElementById('apiHeaders').value = tmpl.headers;
      document.getElementById('apiBody').value = tmpl.body;
      document.getElementById('apiResponsePath').value = tmpl.responsePath;
    }
  }

  function saveApi() {
    const name = document.getElementById('apiName').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const url = document.getElementById('apiUrl').value.trim();
    const method = document.getElementById('apiMethod').value;
    let headers = document.getElementById('apiHeaders').value.trim();
    const body = document.getElementById('apiBody').value.trim();
    const responsePath = document.getElementById('apiResponsePath').value.trim();

    if (!name || !url) {
      alert('请填写名称和 API URL');
      return;
    }

    // 验证 Headers JSON
    if (headers) {
      try {
        headers = JSON.parse(headers);
      } catch (e) {
        alert('请求头 JSON 格式错误');
        return;
      }
    }

    const apiConfig = {
      id: editingApiIndex >= 0
        ? (settings.translate.customApis[editingApiIndex].id)
        : `custom_${Date.now()}`,
      name,
      apiKey,
      url,
      method,
      headers,
      body,
      responsePath,
    };

    if (!settings.translate) settings.translate = { customApis: [] };
    if (!settings.translate.customApis) settings.translate.customApis = [];

    if (editingApiIndex >= 0) {
      settings.translate.customApis[editingApiIndex] = apiConfig;
    } else {
      settings.translate.customApis.push(apiConfig);
    }

    window.pixAPI.updateSettings('translate.customApis', settings.translate.customApis);

    document.getElementById('apiForm').style.display = 'none';
    renderApiList();
    updateEngineSelector();
  }

  // 全局函数（供 onclick 调用）
  window.editApi = function (index) {
    const api = settings.translate?.customApis?.[index];
    if (!api) return;

    editingApiIndex = index;
    document.getElementById('apiName').value = api.name || '';
    document.getElementById('apiKey').value = api.apiKey || '';
    document.getElementById('apiUrl').value = api.url || '';
    document.getElementById('apiMethod').value = api.method || 'POST';
    document.getElementById('apiHeaders').value = typeof api.headers === 'object'
      ? JSON.stringify(api.headers, null, 2)
      : (api.headers || '');
    document.getElementById('apiBody').value = api.body || '';
    document.getElementById('apiResponsePath').value = api.responsePath || '';
    document.getElementById('apiForm').style.display = 'block';
  };

  window.deleteApi = function (index) {
    if (!confirm('确定要删除此翻译 API？')) return;
    settings.translate.customApis.splice(index, 1);
    window.pixAPI.updateSettings('translate.customApis', settings.translate.customApis);
    renderApiList();
    updateEngineSelector();
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ====== 键盘 ======
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.pixAPI.closeSettings();
    }
  });

  init();
})();
