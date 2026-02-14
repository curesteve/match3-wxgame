/**
 * 阶段五：关卡配置表导入工具
 * 读取 JSON 配置（与 game.js 中 LEVELS 结构一致），校验后输出 data/levels.json
 *
 * 用法: node tools/import-levels.js [输入文件]
 *   未指定输入时使用 levels-src.json
 *
 * 配置表格式（JSON 数组，每项一关）:
 *   id          number  必填，关卡序号
 *   moves       number  必填，步数
 *   targetScore number  可选，目标分数（有 goals 时可从 goals 中 score 取）
 *   star2Score   number  可选，2 星分数线
 *   star3Score   number  可选，3 星分数线
 *   goals        array   可选，[{ type:'score', value }, { type:'collect', color, amount }]
 *   walls        array   可选，[[r,c], ...]
 *   ice          array   可选，[[r,c,hp], ...]
 *   grid         array   可选，8x8 初始盘面
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const defaultInput = path.join(projectRoot, 'levels-src.json');
const outputPath = path.join(projectRoot, 'data', 'levels.json');

function validateLevel(lev, index) {
  const err = [];
  if (typeof lev.id !== 'number') err.push('id 必须为数字');
  if (typeof lev.moves !== 'number' || lev.moves < 1) err.push('moves 必须为正整数');
  if (lev.goals && !Array.isArray(lev.goals)) err.push('goals 必须为数组');
  if (lev.walls && !Array.isArray(lev.walls)) err.push('walls 必须为数组');
  if (lev.ice && !Array.isArray(lev.ice)) err.push('ice 必须为数组');
  if (lev.grid && (!Array.isArray(lev.grid) || lev.grid.length < 8)) err.push('grid 须为 8 行数组');
  if (err.length) throw new Error('第 ' + (index + 1) + ' 关: ' + err.join('; '));
}

function main() {
  const inputPath = process.argv[2] || defaultInput;
  let levels;
  try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    levels = JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT' && inputPath === defaultInput) {
      console.error('未找到 levels-src.json，请指定输入文件或创建 levels-src.json');
      process.exit(1);
    }
    console.error('读取或解析失败:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(levels)) {
    console.error('配置必须为 JSON 数组');
    process.exit(1);
  }
  for (let i = 0; i < levels.length; i++) validateLevel(levels[i], i);
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(levels, null, 2), 'utf8');
  console.log('已写入 ' + outputPath + '，共 ' + levels.length + ' 关');
}

main();
