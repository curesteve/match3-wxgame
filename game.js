/**
 * 三消游戏 - 阶段 1.1（微信小游戏）
 * 滑动交换、消除/掉落/填充动画、泡泡立体效果
 */

const COLS = 8;
const ROWS = 8;
const GEM_TYPES = 5;

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];

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
  cellSize = Math.min(w, h) / 8;
  offsetX = (w - cellSize * 8) / 2;
  offsetY = (h - cellSize * 8) / 2;
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
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    grid[m.row][m.col] = -1;
  }
}

function drop() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c] >= 0) {
        if (write !== r) {
          grid[write][c] = grid[r][c];
          grid[r][c] = -1;
        }
        write--;
      }
    }
  }
}

function refill() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] < 0) grid[r][c] = Math.floor(Math.random() * GEM_TYPES);
    }
  }
}


function buildDropAnimsCorrect() {
  dropAnims = [];
  const before = [];
  for (let c = 0; c < COLS; c++) {
    before[c] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c] >= 0) before[c].push({ r: r, type: grid[r][c] });
    }
  }
  drop();
  for (let c = 0; c < COLS; c++) {
    const list = before[c];
    for (let i = 0; i < list.length; i++) {
      const toR = ROWS - 1 - i;
      dropAnims.push({
        fromR: list[i].r,
        fromC: c,
        toR: toR,
        toC: c,
        type: list[i].type,
        progress: 0
      });
    }
  }
}

function buildFillAnims() {
  fillAnims = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] < 0) {
        const type = Math.floor(Math.random() * GEM_TYPES);
        grid[r][c] = type;
        fillAnims.push({ r: r, c: c, type: type, progress: 0 });
      }
    }
  }
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
  touchStartX = x;
  touchStartY = y;
}

function onTouchEnd(e) {
  if (state !== 'idle') return;
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

  swap(r1, c1, r2, c2);
  const hadMatch = getMatches().length > 0;
  if (!hadMatch) {
    swap(r1, c1, r2, c2);
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
        state = 'idle';
        animating = false;
        lastTime = 0;
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
      if (grid[r][c] < 0 && (!fillSet || !fillSet.has(key)) && (!dropTargetSet || !dropTargetSet.has(key))) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
}

function bindTouch() {
  wx.onTouchStart(onTouchStart);
  wx.onTouchEnd(onTouchEnd);
  wx.onTouchCancel(onTouchCancel);
}

function main() {
  initCanvas();
  initGrid();
  bindTouch();
  render();
}

main();
