// Pix 翻译 - 谷歌翻译模块
const https = require('https');
const http = require('http');

/**
 * 使用 Google Translate 免费 API 翻译文本
 * @param {string} text - 待翻译文本
 * @param {string} from - 源语言（'auto' 自动检测）
 * @param {string} to - 目标语言
 * @returns {Promise<{text: string, from: string}>}
 */
async function translate(text, from = 'auto', to = 'zh-CN') {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodedText}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const translatedText = result[0]
            .map(item => item[0])
            .filter(Boolean)
            .join('');
          const detectedLang = result[2] || from;

          resolve({
            text: translatedText,
            from: detectedLang,
          });
        } catch (e) {
          reject(new Error('翻译结果解析失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('翻译请求失败: ' + e.message));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('翻译请求超时'));
    });
  });
}

module.exports = { translate };
