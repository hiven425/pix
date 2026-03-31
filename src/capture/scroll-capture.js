// Pix 长截图 - 滚动截图模块
// 注意：此模块需要 robotjs 依赖，用于模拟鼠标滚轮滚动
// 如果 robotjs 安装失败，可改用 @nut-tree/nut-js

let robot = null;
try {
  robot = require('robotjs');
} catch (e) {
  console.warn('robotjs 未安装或加载失败，长截图功能将受限:', e.message);
}

/**
 * 模拟鼠标滚轮滚动
 * @param {number} x - 滚动位置 X
 * @param {number} y - 滚动位置 Y
 * @param {number} delta - 滚动量（正数向下，负数向上）
 */
function scrollAt(x, y, delta = 3) {
  if (!robot) {
    throw new Error('robotjs 未加载，无法执行滚动操作');
  }

  robot.moveMouse(x, y);
  robot.scrollMouse(0, delta);
}

/**
 * 比较两帧图像的相似度
 * 用于检测是否已滚动到底部（两帧相同则说明已到底）
 * @param {Buffer} frame1 - 第一帧 PNG Buffer
 * @param {Buffer} frame2 - 第二帧 PNG Buffer
 * @returns {number} 相似度 0-1
 */
function compareFrames(imgData1, imgData2) {
  if (!imgData1 || !imgData2) return 0;
  if (imgData1.length !== imgData2.length) return 0;

  let samePixels = 0;
  const totalPixels = imgData1.length / 4; // RGBA

  // 抽样比较（每隔 10 个像素比较一次，提高性能）
  const step = 10;
  let sampled = 0;

  for (let i = 0; i < imgData1.length; i += 4 * step) {
    sampled++;
    const r1 = imgData1[i], g1 = imgData1[i + 1], b1 = imgData1[i + 2];
    const r2 = imgData2[i], g2 = imgData2[i + 1], b2 = imgData2[i + 2];

    // 允许微小差异（抗锯齿等）
    if (Math.abs(r1 - r2) < 5 && Math.abs(g1 - g2) < 5 && Math.abs(b1 - b2) < 5) {
      samePixels++;
    }
  }

  return samePixels / sampled;
}

/**
 * 查找两帧图像的重叠区域
 * 通过逐行比较找到最佳匹配位移
 * @param {ImageData} prev - 上一帧图像数据
 * @param {ImageData} curr - 当前帧图像数据
 * @returns {number} 重叠的像素行数
 */
function findOverlap(prevData, currData, width, height) {
  // 从底部开始搜索重叠区域
  const minOverlap = 20;
  const maxOverlap = Math.floor(height * 0.8);

  let bestOverlap = 0;
  let bestScore = 0;

  for (let overlap = minOverlap; overlap <= maxOverlap; overlap += 2) {
    let matchCount = 0;
    let totalCount = 0;

    // 比较 prev 底部 overlap 行和 curr 顶部 overlap 行
    const sampleStep = 4; // 每隔 4 个像素采样
    for (let y = 0; y < overlap; y += 2) {
      const prevRow = (height - overlap + y) * width * 4;
      const currRow = y * width * 4;

      for (let x = 0; x < width * 4; x += 4 * sampleStep) {
        totalCount++;
        const pr = prevData[prevRow + x], pg = prevData[prevRow + x + 1], pb = prevData[prevRow + x + 2];
        const cr = currData[currRow + x], cg = currData[currRow + x + 1], cb = currData[currRow + x + 2];

        if (Math.abs(pr - cr) < 10 && Math.abs(pg - cg) < 10 && Math.abs(pb - cb) < 10) {
          matchCount++;
        }
      }
    }

    const score = matchCount / totalCount;
    if (score > bestScore && score > 0.85) {
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  return bestOverlap;
}

module.exports = {
  scrollAt,
  compareFrames,
  findOverlap,
};
