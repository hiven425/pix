// Pix 翻译 - 自定义 API 翻译模块
const https = require('https');
const http = require('http');

/**
 * 内置翻译 API 模板
 * 用户可基于这些模板配置自定义翻译服务
 */
const TEMPLATES = {
  deepl: {
    name: 'DeepL',
    url: 'https://api-free.deepl.com/v2/translate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'DeepL-Auth-Key {{apiKey}}',
    },
    body: '{"text":["{{text}}"],"source_lang":"{{from}}","target_lang":"{{to}}"}',
    responsePath: 'translations.0.text',
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer {{apiKey}}',
    },
    body: '{"model":"gpt-3.5-turbo","messages":[{"role":"system","content":"You are a translator. Translate the following text from {{from}} to {{to}}. Only return the translated text."},{"role":"user","content":"{{text}}"}]}',
    responsePath: 'choices.0.message.content',
  },
};

/**
 * 使用自定义 API 翻译文本
 * @param {string} text - 待翻译文本
 * @param {string} from - 源语言
 * @param {string} to - 目标语言
 * @param {Object} config - API 配置
 * @returns {Promise<{text: string}>}
 */
async function translate(text, from, to, config) {
  return new Promise((resolve, reject) => {
    // 模板变量替换
    const replaceVars = (str) => {
      return str
        .replace(/\{\{text\}\}/g, text.replace(/"/g, '\\"'))
        .replace(/\{\{from\}\}/g, from || 'auto')
        .replace(/\{\{to\}\}/g, to || 'zh-CN')
        .replace(/\{\{apiKey\}\}/g, config.apiKey || '');
    };

    const url = new URL(replaceVars(config.url));
    const method = (config.method || 'POST').toUpperCase();
    const headers = {};

    // 处理 Headers
    if (config.headers) {
      const headerObj = typeof config.headers === 'string'
        ? JSON.parse(config.headers)
        : config.headers;
      Object.entries(headerObj).forEach(([key, value]) => {
        headers[key] = replaceVars(String(value));
      });
    }

    const body = config.body ? replaceVars(config.body) : null;
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers,
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);

          // 使用 responsePath 提取翻译结果
          const responsePath = config.responsePath || '';
          let translatedText = result;
          if (responsePath) {
            const parts = responsePath.split('.');
            for (const part of parts) {
              if (translatedText == null) break;
              translatedText = translatedText[isNaN(part) ? part : parseInt(part)];
            }
          }

          if (typeof translatedText !== 'string') {
            translatedText = JSON.stringify(translatedText);
          }

          resolve({ text: translatedText.trim() });
        } catch (e) {
          reject(new Error('自定义 API 响应解析失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('自定义 API 请求失败: ' + e.message));
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('自定义 API 请求超时'));
    });

    if (body && method !== 'GET') {
      req.write(body);
    }
    req.end();
  });
}

module.exports = { translate, TEMPLATES };
