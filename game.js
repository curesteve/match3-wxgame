/**
 * 三消游戏 - 阶段三（微信小游戏）
 * 多目标、收集进度、墙与障碍
 */

const COLS = 8;
const ROWS = 8;
const GEM_TYPES = 5;
const WALL = -2; // 墙格，不参与交换/消除/下落
const HUD_TOP_MARGIN = 98; // 顶部预留给 HUD，避免与棋盘重叠

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];
var COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫'];

// 动画时长（秒）
const DUR_SWAP = 0.15;
const DUR_ELIMINATE = 0.2;
const DUR_DROP = 0.25;
const DUR_FILL = 0.2;

let canvas;
let ctx;
let grid;
let state = 'idle'; // idle | swapping | eliminating | dropping | filling
let cellSize;
let offsetX, offsetY;

// 触摸：滑动交换（起点格子 + 起点像素，用于方向推断）
let touchStartCell = null; // { row, col }
let touchStartX = 0;
let touchStartY = 0;

const MIN_SWIPE_PX = 18; // 最小滑动距离（像素），小于则视为点击忽略

// 关卡配置（阶段二/三）：id, moves, targetScore, goals, grid, walls, ice 可选
var LEVELS = [
  { id: 1, moves: 20, targetScore: 500 },
  { id: 2, moves: 18, targetScore: 600 },
  { id: 3, moves: 16, targetScore: 700 },
  { id: 4, moves: 15, targetScore: 800 },
  { id: 5, moves: 14, targetScore: 1000 },
  { id: 6, moves: 22, goals: [{ type: 'score', value: 600 }, { type: 'collect', color: 0, amount: 15 }] },
  { id: 7, moves: 20, goals: [{ type: 'collect', color: 1, amount: 20 }, { type: 'collect', color: 2, amount: 18 }] },
  { id: 8, moves: 18, targetScore: 800, walls: [[0, 3], [0, 4], [7, 3], [7, 4]] },
  { id: 9, moves: 20, goals: [{ type: 'score', value: 700 }, { type: 'collect', color: 3, amount: 12 }], walls: [[3, 2], [3, 5], [4, 2], [4, 5]] },
  { id: 10, moves: 18, targetScore: 600, ice: [[2, 2, 1], [2, 5, 1], [5, 2, 1], [5, 5, 1]] }
];

function getLevelConfig(levelId) {
  var idx = levelId - 1;
  if (idx < 0 || idx >= LEVELS.length) return null;
  var config = LEVELS[idx];
  if (!config.goals) config.goals = [{ type: 'score', value: config.targetScore != null ? config.targetScore : 500 }];
  return config;
}

function allGoalsMet() {
  for (var i = 0; i < currentGoals.length; i++) {
    var g = currentGoals[i];
    if (g.type === 'score') {
      if (score < g.value) return false;
    } else if (g.type === 'collect') {
      var key = 'collect_' + g.color;
      if ((goalProgress[key] || 0) < g.amount) return false;
    }
  }
  return true;
}

// 关卡状态
var currentLevelId = 1;
var movesLeft = 20;
var score = 0;
var targetScore = 500;
var currentGoals = []; // 当前关 goals，来自 getLevelConfig
var goalProgress = {}; // collect_0..collect_4 收集数量
var overlay = null; // null | 'win' | 'fail'
var comboIndex = 0; // 连消序号，用于计分加成
var wallGrid = []; // wallGrid[r][c] === true 表示墙
var iceGrid = []; // iceGrid[r][c] 为冰块血量，0 表示无

// 交换动画：两格互换
let swapAnim = null; // { r1, c1, r2, c2, progress }

// 消除动画
let eliminateAnim = null; // { matches: [{row,col}], progress }

// 下落动画
let dropAnims = []; // { fromR, fromC, toR, toC, type, progress }

// 填充动画（新块从顶部落入）
let fillAnims = []; // { r, c, type, progress }

let lastTime = 0;
let animating = false;

function initCanvas() {
  canvas = wx.createCanvas();
  const sys = wx.getSystemInfoSync();
  const w = sys.windowWidth || 375;
  const h = sys.windowHeight || 375;
  canvas.width = w;
  canvas.height = h;
  var playH = h - HUD_TOP_MARGIN;
  cellSize = Math.min(w, playH) / 8;
  offsetX = (w - cellSize * 8) / 2;
  offsetY = HUD_TOP_MARGIN + (playH - cellSize * 8) / 2;
  ctx = canvas.getContext('2d');
}

function initGrid() {
  do {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = Math.floor(Math.random() * GEM_TYPES);
      }
    }
  } while (getMatches().length > 0);
}

function initGridFromData(gridData) {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      var val = gridData[r][c];
      grid[r][c] = typeof val === 'number' && val >= 0 && val < GEM_TYPES ? val : Math.floor(Math.random() * GEM_TYPES);
    }
  }
}

function startLevel(levelId) {
  var config = getLevelConfig(levelId);
  if (!config) return;
  currentLevelId = levelId;
  movesLeft = config.moves;
  score = 0;
  var scoreGoal = null;
  if (config.goals && config.goals.length) {
    for (var g = 0; g < config.goals.length; g++) {
      if (config.goals[g].type === 'score') { scoreGoal = config.goals[g]; break; }
    }
  }
  targetScore = scoreGoal ? scoreGoal.value : (config.targetScore || 500);
  currentGoals = config.goals || [{ type: 'score', value: config.targetScore || 500 }];
  goalProgress = {};
  for (var c = 0; c < GEM_TYPES; c++) goalProgress['collect_' + c] = 0;
  overlay = null;
  comboIndex = 0;
  state = 'idle';
  swapAnim = null;
  eliminateAnim = null;
  dropAnims = [];
  fillAnims = [];
  animating = false;
  lastTime = 0;
  wallGrid = [];
  for (var r = 0; r < ROWS; r++) {
    wallGrid[r] = [];
    for (var c = 0; c < COLS; c++) wallGrid[r][c] = false;
  }
  if (config.walls && config.walls.length) {
    for (var i = 0; i < config.walls.length; i++) {
      var w = config.walls[i];
      if (w[0] >= 0 && w[0] < ROWS && w[1] >= 0 && w[1] < COLS) wallGrid[w[0]][w[1]] = true;
    }
  }
  iceGrid = [];
  for (var r = 0; r < ROWS; r++) {
    iceGrid[r] = [];
    for (var c = 0; c < COLS; c++) iceGrid[r][c] = 0;
  }
  if (config.ice && config.ice.length) {
    for (var i = 0; i < config.ice.length; i++) {
      var ic = config.ice[i];
      if (ic[0] >= 0 && ic[0] < ROWS && ic[1] >= 0 && ic[1] < COLS && ic[2] > 0) iceGrid[ic[0]][ic[1]] = ic[2];
    }
  }
  if (config.grid && config.grid.length >= ROWS) {
    initGridFromData(config.grid);
  } else {
    initGrid();
  }
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (wallGrid[r][c]) grid[r][c] = WALL;
    }
  }
  render();
}

function getMatches() {
  const set = new Set();
  const add = (r, c) => set.add(r + ',' + c);
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && grid[r][c] === grid[r][c - 1] && grid[r][c] >= 0;
      if (same) run++;
      else {
        if (run >= 3) for (let i = c - run; i < c; i++) add(r, i);
        run = 1;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && grid[r][c] === grid[r - 1][c] && grid[r][c] >= 0;
      if (same) run++;
      else {
        if (run >= 3) for (let i = r - run; i < r; i++) add(i, c);
        run = 1;
      }
    }
  }
  return Array.from(set).map(function (s) {
    const p = s.split(',');
    return { row: +p[0], col: +p[1] };
  });
}

function swap(r1, c1, r2, c2) {
  if (isWall(r1, c1) || isWall(r2, c2)) return;
  const t = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = t;
}

function isAdjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function removeMatches(matches) {
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var r = m.row, c = m.col;
    if (iceGrid[r] && iceGrid[r][c] > 0) iceGrid[r][c]--;
    grid[r][c] = -1;
  }
}

function drop() {
  for (var c = 0; c < COLS; c++) {
    var targetRows = [];
    for (var r = ROWS - 1; r >= 0; r--) {
      if (!isWall(r, c)) targetRows.push(r);
    }
    var gems = [];
    for (var r = ROWS - 1; r >= 0; r--) {
      if (!isWall(r, c) && grid[r][c] >= 0) gems.push(grid[r][c]);
    }
    for (var i = 0; i < targetRows.length; i++) {
      grid[targetRows[i]][c] = i < gems.length ? gems[i] : -1;
    }
  }
}

function refill() {
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (!isWall(r, c) && grid[r][c] < 0 && (iceGrid[r][c] || 0) === 0) grid[r][c] = Math.floor(Math.random() * GEM_TYPES);
    }
  }
}


function buildDropAnimsCorrect() {
  dropAnims = [];
  for (var c = 0; c < COLS; c++) {
    var targetRows = [];
    for (var r = ROWS - 1; r >= 0; r--) {
      if (!isWall(r, c)) targetRows.push(r);
    }
    var gems = [];
    for (var r = ROWS - 1; r >= 0; r--) {
      if (!isWall(r, c) && grid[r][c] >= 0) gems.push({ r: r, type: grid[r][c] });
    }
    for (var i = 0; i < gems.length; i++) {
      var toR = targetRows[i];
      dropAnims.push({
        fromR: gems[i].r,
        fromC: c,
        toR: toR,
        toC: c,
        type: gems[i].type,
        progress: 0
      });
    }
  }
  drop();
}

function buildFillAnims() {
  fillAnims = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (!isWall(r, c) && grid[r][c] < 0 && (iceGrid[r][c] || 0) === 0) {
        var type = Math.floor(Math.random() * GEM_TYPES);
        grid[r][c] = type;
        fillAnims.push({ r: r, c: c, type: type, progress: 0 });
      }
    }
  }
}

function isWall(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS && (wallGrid[r] && wallGrid[r][c]);
}

function getCellFromTouch(clientX, clientY) {
  const x = clientX - offsetX;
  const y = clientY - offsetY;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return { row: row, col: col };
}

/** 根据滑动方向得到相邻目标格（dx, dy 为像素位移） */
function getAdjacentCellByDirection(r1, c1, dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 1 && ady < 1) return null;
  let r2 = r1;
  let c2 = c1;
  if (adx >= ady) {
    c2 = c1 + (dx > 0 ? 1 : -1);
  } else {
    r2 = r1 + (dy > 0 ? 1 : -1);
  }
  if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return null;
  if (isWall(r2, c2)) return null;
  return { row: r2, col: c2 };
}

function clearTouch() {
  touchStartCell = null;
  touchStartX = 0;
  touchStartY = 0;
}

function onTouchStart(e) {
  if (state !== 'idle') return;
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  const x = touch.clientX != null ? touch.clientX : touch.x;
  const y = touch.clientY != null ? touch.clientY : touch.y;
  touchStartCell = getCellFromTouch(x, y);
  if (touchStartCell && isWall(touchStartCell.row, touchStartCell.col)) touchStartCell = null;
  touchStartX = x;
  touchStartY = y;
}

function onTouchEnd(e) {
  if (state !== 'idle') return;
  if (overlay === 'win' || overlay === 'fail') {
    handleOverlayTouch(e);
    return;
  }
  if (movesLeft <= 0) return;
  const touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  const endX = touch.clientX != null ? touch.clientX : touch.x;
  const endY = touch.clientY != null ? touch.clientY : touch.y;

  if (!touchStartCell) {
    clearTouch();
    return;
  }

  const r1 = touchStartCell.row;
  const c1 = touchStartCell.col;
  let r2, c2;
  const endCell = getCellFromTouch(endX, endY);

  if (endCell && isAdjacent(r1, c1, endCell.row, endCell.col)) {
    r2 = endCell.row;
    c2 = endCell.col;
  } else {
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_SWIPE_PX) {
      clearTouch();
      return;
    }
    const dirCell = getAdjacentCellByDirection(r1, c1, dx, dy);
    if (!dirCell) {
      clearTouch();
      return;
    }
    r2 = dirCell.row;
    c2 = dirCell.col;
  }

  clearTouch();
  if (r1 === r2 && c1 === c2) return;
  if (isWall(r1, c1) || isWall(r2, c2)) return;

  movesLeft--;
  swap(r1, c1, r2, c2);
  const hadMatch = getMatches().length > 0;
  if (!hadMatch) {
    swap(r1, c1, r2, c2);
    movesLeft++;
    render();
    return;
  }
  state = 'swapping';
  swapAnim = { r1: r1, c1: c1, r2: r2, c2: c2, progress: 0 };
  if (!animating) requestAnimationFrame(gameLoop);
}

function onTouchCancel() {
  clearTouch();
}

var btnNextRect = null;
var btnRetryRect = null;

function handleOverlayTouch(e) {
  var touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  var x = touch.clientX != null ? touch.clientX : touch.x;
  var y = touch.clientY != null ? touch.clientY : touch.y;
  if (overlay === 'win' && btnNextRect && x >= btnNextRect.x && x <= btnNextRect.x + btnNextRect.w && y >= btnNextRect.y && y <= btnNextRect.y + btnNextRect.h) {
    var nextId = currentLevelId + 1;
    if (getLevelConfig(nextId)) {
      startLevel(nextId);
    } else {
      startLevel(1);
    }
  } else if (overlay === 'fail' && btnRetryRect && x >= btnRetryRect.x && x <= btnRetryRect.x + btnRetryRect.w && y >= btnRetryRect.y && y <= btnRetryRect.y + btnRetryRect.h) {
    startLevel(currentLevelId);
  }
}

function gameLoop(now) {
  now = now || 0;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
  lastTime = now;
  animating = true;

  if (state === 'swapping' && swapAnim) {
    swapAnim.progress += dt / DUR_SWAP;
    if (swapAnim.progress >= 1) {
      swapAnim = null;
      state = 'eliminating';
      const matches = getMatches();
      eliminateAnim = {
        matches: matches.map(function (m) { return { row: m.row, col: m.col, type: grid[m.row][m.col] }; }),
        progress: 0
      };
    }
  }

  if (state === 'eliminating' && eliminateAnim) {
    eliminateAnim.progress += dt / DUR_ELIMINATE;
    if (eliminateAnim.progress >= 1) {
      comboIndex++;
      var addScore = eliminateAnim.matches.length * 10 * comboIndex;
      score += addScore;
      for (var i = 0; i < eliminateAnim.matches.length; i++) {
        var m = eliminateAnim.matches[i];
        if (m.type >= 0 && m.type < GEM_TYPES) {
          var key = 'collect_' + m.type;
          goalProgress[key] = (goalProgress[key] || 0) + 1;
        }
      }
      removeMatches(eliminateAnim.matches.map(function (m) { return { row: m.row, col: m.col }; }));
      buildDropAnimsCorrect();
      eliminateAnim = null;
      state = dropAnims.length > 0 ? 'dropping' : 'filling';
      if (state === 'filling') {
        buildFillAnims();
      }
    }
  }

  if (state === 'dropping' && dropAnims.length > 0) {
    let allDone = true;
    for (let i = 0; i < dropAnims.length; i++) {
      dropAnims[i].progress += dt / DUR_DROP;
      if (dropAnims[i].progress < 1) allDone = false;
    }
    if (allDone) {
      dropAnims = [];
      buildFillAnims();
      state = 'filling';
    }
  }

  if (state === 'filling' && fillAnims.length > 0) {
    let allDone = true;
    for (let i = 0; i < fillAnims.length; i++) {
      fillAnims[i].progress += dt / DUR_FILL;
      if (fillAnims[i].progress < 1) allDone = false;
    }
    if (allDone) {
      fillAnims = [];
      const next = getMatches();
      if (next.length > 0) {
        state = 'eliminating';
        eliminateAnim = { matches: next, progress: 0 };
      } else {
        comboIndex = 0;
        state = 'idle';
        animating = false;
        lastTime = 0;
        if (allGoalsMet()) {
          overlay = 'win';
        } else if (movesLeft <= 0) {
          overlay = 'fail';
        }
        render();
        return;
      }
    }
  }

  render();
  if (state !== 'idle') requestAnimationFrame(gameLoop);
  else animating = false;
}

function drawBubbleGem(x, y, size, colorIndex, scale, opacity) {
  if (scale <= 0 || opacity <= 0) return;
  const pad = 2;
  const w = (size - pad * 2) * scale;
  const h = w;
  const cx = x + (size - pad * 2) / 2;
  const cy = y + (size - pad * 2) / 2;
  const baseColor = COLORS[colorIndex];
  const dark = shadeColor(baseColor, -0.35);
  const light = shadeColor(baseColor, 0.4);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const r = (size - pad * 2) / 2;
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.2);
  grad.addColorStop(0, light);
  grad.addColorStop(0.5, baseColor);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.25, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + (num >> 16) * percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + ((num >> 8) & 0x00FF) * percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + (num & 0x0000FF) * percent));
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, w, h);

  var hudY = 14;
  var lineH = 16;
  ctx.fillStyle = '#eee';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('步数: ' + movesLeft, offsetX, hudY);
  for (var i = 0; i < currentGoals.length; i++) {
    var goal = currentGoals[i];
    var y = hudY + (i + 1) * lineH;
    if (goal.type === 'score') {
      ctx.fillStyle = '#eee';
      ctx.fillText('分数: ' + score + ' / ' + goal.value, offsetX, y);
    } else if (goal.type === 'collect') {
      var prog = goalProgress['collect_' + goal.color] || 0;
      var name = COLOR_NAMES[goal.color] != null ? COLOR_NAMES[goal.color] : ('色' + goal.color);
      ctx.fillStyle = COLORS[goal.color] || '#eee';
      ctx.fillText(name + ': ' + prog + ' / ' + goal.amount, offsetX, y);
    }
  }
  ctx.fillStyle = '#eee';

  const pad = 2;
  const elimSet = eliminateAnim ? new Set(eliminateAnim.matches.map(function (m) { return m.row + ',' + m.col; })) : null;
  const elimTypes = eliminateAnim ? new Map(eliminateAnim.matches.map(function (m) { return [m.row + ',' + m.col, m.type]; })) : null;
  const dropTargetSet = dropAnims.length ? new Set(dropAnims.map(function (a) { return a.toR + ',' + a.toC; })) : null;
  const fillSet = fillAnims.length ? new Set(fillAnims.map(function (a) { return a.r + ',' + a.c; })) : null;
  const swapCells = swapAnim ? new Set([swapAnim.r1 + ',' + swapAnim.c1, swapAnim.r2 + ',' + swapAnim.c2]) : null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const key = r + ',' + c;
      const isElim = elimSet && elimSet.has(key);
      const isDropTarget = dropTargetSet && dropTargetSet.has(key);
      const isFilling = fillSet && fillSet.has(key);
      const isSwapping = swapCells && swapCells.has(key);

      if (isSwapping) continue;
      if (isElim && eliminateAnim && elimTypes) {
        const p = eliminateAnim.progress;
        const scale = 1 - p;
        const opacity = 1 - p;
        const cell = elimTypes.get(key);
        if (cell >= 0) drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, cell, scale, opacity);
        continue;
      }
      if (isDropTarget && dropAnims.length > 0) {
      } else if (grid[r][c] >= 0 && !isFilling) {
        drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, grid[r][c], 1, 1);
      }
    }
  }

  if (swapAnim) {
    const p = swapAnim.progress;
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const x1 = offsetX + swapAnim.c1 * cellSize;
    const y1 = offsetY + swapAnim.r1 * cellSize;
    const x2 = offsetX + swapAnim.c2 * cellSize;
    const y2 = offsetY + swapAnim.r2 * cellSize;
    const dx = (x2 - x1) * ease;
    const dy = (y2 - y1) * ease;
    drawBubbleGem(x1 + pad + dx, y1 + pad - dy, cellSize - pad * 2, grid[swapAnim.r2][swapAnim.c2], 1, 1);
    drawBubbleGem(x2 + pad - dx, y2 + pad + dy, cellSize - pad * 2, grid[swapAnim.r1][swapAnim.c1], 1, 1);
  }

  for (let i = 0; i < dropAnims.length; i++) {
    const a = dropAnims[i];
    const p = Math.min(a.progress, 1);
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const fromX = offsetX + a.fromC * cellSize;
    const fromY = offsetY + a.fromR * cellSize;
    const toX = offsetX + a.toC * cellSize;
    const toY = offsetY + a.toR * cellSize;
    const x = fromX + (toX - fromX) * ease;
    const y = fromY + (toY - fromY) * ease;
    drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, a.type, 1, 1);
  }

  for (let i = 0; i < fillAnims.length; i++) {
    const a = fillAnims[i];
    const p = Math.min(a.progress, 1);
    const ease = 1 - (1 - p) * (1 - p);
    const x = offsetX + a.c * cellSize + pad;
    const y = offsetY + a.r * cellSize + pad - (1 - ease) * cellSize;
    drawBubbleGem(x, y, cellSize - pad * 2, a.type, 1, 1);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const key = r + ',' + c;
      if (isWall(r, c)) {
        ctx.fillStyle = '#3d3d5c';
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        ctx.strokeStyle = '#5c5c8a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      } else if (grid[r][c] < 0 && (!fillSet || !fillSet.has(key)) && (!dropTargetSet || !dropTargetSet.has(key))) {
        ctx.fillStyle = (iceGrid[r] && iceGrid[r][c] > 0) ? 'rgba(200,230,255,0.4)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  if (overlay === 'win' || overlay === 'fail') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);
    var panelW = 220;
    var panelH = 100;
    var panelX = (w - panelW) / 2;
    var panelY = (h - panelH) / 2;
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = '#eee';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(overlay === 'win' ? '胜利！' : '步数用尽', w / 2, panelY + 32);
    var btnW = 100;
    var btnH = 36;
    var btnX = (w - btnW) / 2;
    var btnY = panelY + 52;
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(overlay === 'win' ? '下一关' : '重试', w / 2, btnY + 24);
    if (overlay === 'win') {
      btnNextRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      btnRetryRect = null;
    } else {
      btnRetryRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      btnNextRect = null;
    }
  } else {
    btnNextRect = null;
    btnRetryRect = null;
  }
}

function bindTouch() {
  wx.onTouchStart(onTouchStart);
  wx.onTouchEnd(onTouchEnd);
  wx.onTouchCancel(onTouchCancel);
}

function main() {
  initCanvas();
  bindTouch();
  startLevel(1);
}

main();
