/**
 * 三消游戏 - 阶段四（微信小游戏）
 * 糖果风色块、果冻弹性下落、炫酷消除特效、音效、特殊块
 * 当前版本：M1
 */
var GAME_VERSION = 'M1';

// 云开发持久化：环境 ID，开通云开发后替换为你的环境 ID；空字符串则不同步云端
var CLOUD_ENV = 'cloud1-8gebksxb1f687118';
var currentUserId = null;
var dataService = {
  ensureUser: function (cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV) { if (cb) cb({ ok: false }); return; }
    wx.cloud.callFunction({ name: 'userEnsure' }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? result : { ok: false });
    }).catch(function () { if (cb) cb({ ok: false }); });
  },
  getProgress: function (userId, cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV || !userId) { if (cb) cb({ ok: false }); return; }
    wx.cloud.callFunction({ name: 'progressGet', data: { userId: userId } }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? result : { ok: false });
    }).catch(function () { if (cb) cb({ ok: false }); });
  },
  saveProgress: function (userId, data, cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV || !userId) { if (cb) cb({ ok: false }); return; }
    wx.cloud.callFunction({ name: 'progressSave', data: { userId: userId, data: data } }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? result : { ok: false });
    }).catch(function () { if (cb) cb({ ok: false }); });
  },
  submitRecord: function (userId, record, cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV || !userId) { if (cb) cb({ ok: false }); return; }
    wx.cloud.callFunction({ name: 'recordSubmit', data: { userId: userId, record: record } }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? result : { ok: false });
    }).catch(function () { if (cb) cb({ ok: false }); });
  },
  submitGlobalRank: function (userId, totalScore, cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV || !userId) { if (cb) cb({ ok: false }); return; }
    wx.cloud.callFunction({ name: 'rankSubmit', data: { userId: userId, totalScore: totalScore } }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? result : { ok: false });
    }).catch(function () { if (cb) cb({ ok: false }); });
  },
  getGlobalRank: function (cb) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction || !CLOUD_ENV) { if (cb) cb({ ok: false, list: [] }); return; }
    wx.cloud.callFunction({ name: 'rankList', data: { limit: 50 } }).then(function (res) {
      var result = res.result;
      if (cb) cb(result && result.ok ? { ok: true, list: result.list || [] } : { ok: false, list: [] });
    }).catch(function () { if (cb) cb({ ok: false, list: [] }); });
  }
};

const COLS = 8;
const ROWS = 8;
const GEM_TYPES = 5;
const WALL = -2; // 墙格，不参与交换/消除/下落
const LINE_H = 6; // 横向直线消除
const LINE_V = 7; // 纵向直线消除
const BOMB = 8;   // 3×3 爆炸
const HUD_TOP_MARGIN = 98; // 顶部预留给 HUD，避免与棋盘重叠
const HUD_SAFE_TOP_EXTRA = 36;   // HUD 相对安全区顶部的额外下移，避免遮挡状态栏/刘海
const RANK_PANEL_RIGHT_MARGIN = 28; // 排名面板距右边缘，避免遮挡小程序胶囊按钮

// 糖果风：鲜艳且蓝绿区分明显（红、蓝、绿、黄、紫）
const COLORS = ['#ff4757', '#1e90ff', '#2ed573', '#ffd93d', '#a55eea'];
var COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫'];

// 卡通风格字体：优先使用加载的自定义字体，否则用系统圆体兜底
var FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif';

// 微信 8.0.69+ 兼容：用最简单方格绘制棋盘（仅 fillRect/strokeRect，无渐变/roundRect/quadraticCurveTo）
var USE_SIMPLE_GRID = (typeof wx !== 'undefined');

// 宝石图片：images/gem_0.png ~ gem_4.png，按颜色索引；未加载则用色块
var GEM_IMAGES = [];
/** 可选：真机代码包/路径失败时，从该 URL 前缀下载 gem_0.png～gem_4.png，如 'https://xxx.com/gems/'（需配置合法域名） */
var GEM_IMAGES_BASE_URL = '';
// 动画时长（秒）
const DUR_SWAP = 0.15;
const DUR_ELIMINATE = 0.28;
const DUR_DROP = 0.25;
const DUR_FILL = 0.2;

let canvas;
let ctx;
let grid;
let state = 'idle'; // idle | swapping | eliminating | dropping | filling
let cellSize;
let offsetX, offsetY;
// iPhone 灵动岛与四周圆角安全区（避开遮挡）
var safeInsetTop = 0;
var safeInsetBottom = 0;
var safeInsetLeft = 0;
var safeInsetRight = 0;
var contentWidth = 0;
var contentHeight = 0;
var contentX = 0;
var contentY = 0;
var bgImage = null; // 背景图 images/bg.png，可选

// 触摸：滑动交换（起点格子 + 起点像素，用于方向推断）
let touchStartCell = null; // { row, col }
let touchStartX = 0;
let touchStartY = 0;

const MIN_SWIPE_PX = 18; // 最小滑动距离（像素），小于则视为点击忽略

// 无限关卡模式：难度由「过关积分/步数」与「色块数量/步数」共同控制；每三关出现一关含色块消除
function generateLevelConfig(levelId) {
  if (levelId < 1) return null;
  var d = levelId; // 综合难度指数
  var moves = Math.max(8, 20 - Math.floor(d / 3)); // 步数随难度缓慢递减
  var targetScore = 350 + d * 75; // 分数/步数 控制难度
  var config = { id: levelId, moves: moves, targetScore: targetScore };
  config.goals = [{ type: 'score', value: targetScore }];
  if (levelId % 3 === 0) {
    var collectPerMove = 0.35 + d * 0.015; // 色块数量/步数 随难度递进，与分数/步数共同控制难度
    var maxCollect = Math.max(4, Math.min(moves - 2, Math.floor(moves * collectPerMove))); // 最多的一种色块数量
    var numColors = levelId % 5 || 5; // 色块颜色数 = 关卡数 % 5，余 0 视为 5
    var used = {};
    for (var nc = 0; nc < numColors; nc++) {
      var color = (levelId - 1 + nc) % GEM_TYPES;
      if (used[color]) {
        for (var c2 = 0; c2 < GEM_TYPES; c2++) {
          if (!used[c2]) { color = c2; break; }
        }
      }
      used[color] = true;
      var amount = nc === 0 ? maxCollect : Math.max(2, Math.min(maxCollect - 1, maxCollect - nc * 2)); // 其余色块小于最多数量
      config.goals.push({ type: 'collect', color: color, amount: amount });
    }
  }
  if (levelId >= 6 && levelId % 5 === 1) {
    var r = levelId % 4;
    config.walls = [[r, 3], [r, 4], [7 - r, 3], [7 - r, 4]];
  }
  if (levelId >= 8 && levelId % 6 === 2) {
    config.ice = [[2, 2, 1], [2, 5, 1], [5, 2, 1], [5, 5, 1]];
  }
  return config;
}

// 阶段五：存档 key 与默认结构（含货币、体力、任务）
var SAVE_KEY = 'game_save';
var STAMINA_MAX = 5;
var STAMINA_RECOVER_MS = 5 * 60 * 1000; // 5 分钟恢复 1 点
var STAMINA_GOLD_COST = 100; // 体力不足时可用金币购买 1 点体力的价格
function getDefaultSave() {
  return {
    version: 1,
    maxUnlockedLevel: 1,
    stars: {},
    bestScorePerLevel: {},
    gameRecords: [],
    updatedAt: 0,
    gold: 0,
    stamina: STAMINA_MAX,
    lastStaminaTime: 0,
    taskProgress: {},
    taskEvents: [],
    lastDailyReset: '',
    lastWeeklyReset: '',
    sessionActive: false,
    resumableLevelId: 1,
    levelStuckCount: {},
    levelAdjustments: {},
    fourMatchRewardCounter: 0,
    fourMatchGoldClaimedDate: '',
    fourMatchGoldClaimedToday: 0
  };
}
function loadSave() {
  try {
    var raw = wx.getStorageSync && wx.getStorageSync(SAVE_KEY);
    if (!raw) return getDefaultSave();
    var data = JSON.parse(raw);
    if (!data.stars || typeof data.stars !== 'object') data.stars = {};
    if (!data.bestScorePerLevel || typeof data.bestScorePerLevel !== 'object') data.bestScorePerLevel = {};
    if (!Array.isArray(data.gameRecords)) data.gameRecords = [];
    if (typeof data.maxUnlockedLevel !== 'number') data.maxUnlockedLevel = 1;
    if (!data.version) data.version = 1;
    if (typeof data.updatedAt !== 'number') data.updatedAt = 0;
    if (typeof data.gold !== 'number') data.gold = 0;
    if (typeof data.stamina !== 'number') data.stamina = STAMINA_MAX;
    if (typeof data.lastStaminaTime !== 'number') data.lastStaminaTime = 0;
    if (!data.taskProgress || typeof data.taskProgress !== 'object') data.taskProgress = {};
    if (!Array.isArray(data.taskEvents)) data.taskEvents = [];
    if (typeof data.lastDailyReset !== 'string') data.lastDailyReset = '';
    if (typeof data.lastWeeklyReset !== 'string') data.lastWeeklyReset = '';
    if (typeof data.sessionActive !== 'boolean') data.sessionActive = false;
    if (typeof data.resumableLevelId !== 'number') data.resumableLevelId = 1;
    if (!data.levelStuckCount || typeof data.levelStuckCount !== 'object') data.levelStuckCount = {};
    if (!data.levelAdjustments || typeof data.levelAdjustments !== 'object') data.levelAdjustments = {};
    if (typeof data.fourMatchRewardCounter !== 'number') data.fourMatchRewardCounter = 0;
    if (typeof data.fourMatchGoldClaimedDate !== 'string') data.fourMatchGoldClaimedDate = '';
    if (typeof data.fourMatchGoldClaimedToday !== 'number') data.fourMatchGoldClaimedToday = 0;
    return data;
  } catch (e) {
    return getDefaultSave();
  }
}
function saveSave(data) {
  try {
    if (wx.setStorageSync) wx.setStorageSync(SAVE_KEY, JSON.stringify(data));
  } catch (e) {}
}
/** 当前体力（按时间恢复计算，不写档） */
function getCurrentStamina() {
  if (!saveData) return 0;
  var now = typeof Date.now === 'function' ? Date.now() : 0;
  var elapsed = now - (saveData.lastStaminaTime || 0);
  var recovered = Math.floor(elapsed / STAMINA_RECOVER_MS);
  return Math.min(STAMINA_MAX, (saveData.stamina || 0) + recovered);
}
/** 消耗 1 点体力，成功返回 true 并写档 */
function consumeStamina() {
  if (!saveData) return false;
  var cur = getCurrentStamina();
  if (cur < 1) return false;
  var now = typeof Date.now === 'function' ? Date.now() : 0;
  saveData.stamina = cur - 1;
  saveData.lastStaminaTime = now;
  saveSave(saveData);
  return true;
}
/** 增加体力（任务奖励），最多到上限，并写档 */
function addStamina(n) {
  if (!saveData || n <= 0) return;
  var cur = getCurrentStamina();
  var now = typeof Date.now === 'function' ? Date.now() : 0;
  saveData.stamina = Math.min(STAMINA_MAX, cur + n);
  saveData.lastStaminaTime = now;
  saveSave(saveData);
}

/** 消耗 1 点体力并执行 callback；若体力不足且金币够 100，弹窗确认后扣 100 金购买 1 体力再消耗并执行 callback */
function tryConsumeStaminaOrBuyAndRun(callback) {
  if (getCurrentStamina() >= 1) {
    if (consumeStamina()) callback();
    return;
  }
  var gold = saveData && typeof saveData.gold === 'number' ? saveData.gold : 0;
  if (gold >= STAMINA_GOLD_COST && typeof wx !== 'undefined' && wx.showModal) {
    wx.showModal({
      title: '购买体力',
      content: '消耗' + STAMINA_GOLD_COST + '金币购买1点体力？',
      success: function (res) {
        if (res.confirm && saveData && saveData.gold >= STAMINA_GOLD_COST) {
          saveData.gold -= STAMINA_GOLD_COST;
          saveSave(saveData);
          addStamina(1);
          if (consumeStamina()) callback();
          persistProgressToCloud();
        }
      }
    });
    return;
  }
  if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: '体力不足', icon: 'none' });
}

// ---------- 任务系统：配置、周期、重置、事件记录 ----------
/** 今日日期键 YYYY-MM-DD（本地） */
function getDateKey() {
  var d = new Date();
  var y = d.getFullYear();
  var m = (d.getMonth() + 1);
  var day = d.getDate();
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
/** 本周周键：本周一日期 YYYY-MM-DD（本地，周一为起点） */
function getWeekKey() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  var monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  var y = monday.getFullYear();
  var m = monday.getMonth() + 1;
  var da = monday.getDate();
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (da < 10 ? '0' : '') + da;
}

var TASK_CONFIG = [
  { id: 'daily_1', type: 'daily', name: '完成1关', desc: '完成任意1局游戏', prerequisiteIds: [], difficulty: 1, rewardGold: 50, rewardStamina: 0, objective: { type: 'complete_levels', target: 1 } },
  { id: 'daily_2', type: 'daily', name: '分享1次', desc: '分享给好友或朋友圈', prerequisiteIds: [], difficulty: 2, rewardGold: 100, rewardStamina: 0, objective: { type: 'share', target: 1 } },
  { id: 'daily_3', type: 'daily', name: '完成3关', desc: '完成任意3局游戏', prerequisiteIds: [], difficulty: 3, rewardGold: 50, rewardStamina: 1, objective: { type: 'complete_levels', target: 3 } },
  { id: 'weekly_1', type: 'weekly', name: '完成10关', desc: '本周完成10局游戏', prerequisiteIds: [], difficulty: 4, rewardGold: 200, rewardStamina: 0, objective: { type: 'complete_levels', target: 10 } },
  { id: 'weekly_2', type: 'weekly', name: '四连5次', desc: '本周累计产生5次四连或以上消除', prerequisiteIds: ['weekly_1'], difficulty: 3, rewardGold: 50, rewardStamina: 1, objective: { type: 'make_4_match', target: 5 } }
];

function getTaskConfig() { return TASK_CONFIG; }

/** 追加任务事件到 taskEvents，并可选限制条数 */
function recordTaskEvent(taskId, eventType, payload) {
  if (!saveData) return;
  if (!Array.isArray(saveData.taskEvents)) saveData.taskEvents = [];
  var periodKey = '';
  var cfg = TASK_CONFIG.filter(function (t) { return t.id === taskId; })[0];
  if (cfg) periodKey = cfg.type === 'daily' ? getDateKey() : getWeekKey();
  saveData.taskEvents.push({
    taskId: taskId,
    eventType: eventType,
    timestamp: typeof Date.now === 'function' ? Date.now() : 0,
    periodKey: periodKey,
    payload: payload || {}
  });
  var maxEvents = 500;
  if (saveData.taskEvents.length > maxEvents) saveData.taskEvents = saveData.taskEvents.slice(-maxEvents);
  saveSave(saveData);
}

/** 每日/每周重置：若跨天/跨周则清空对应类型任务进度并更新 lastDailyReset / lastWeeklyReset */
function resetDailyWeeklyIfNeeded() {
  if (!saveData) return;
  var today = getDateKey();
  var thisWeek = getWeekKey();
  var changed = false;
  if (saveData.lastDailyReset !== today) {
    for (var i = 0; i < TASK_CONFIG.length; i++) {
      if (TASK_CONFIG[i].type !== 'daily') continue;
      var tid = TASK_CONFIG[i].id;
      saveData.taskProgress[tid] = { status: 'locked', progress: 0 };
    }
    saveData.lastDailyReset = today;
    changed = true;
  }
  if (saveData.lastWeeklyReset !== thisWeek) {
    for (var j = 0; j < TASK_CONFIG.length; j++) {
      if (TASK_CONFIG[j].type !== 'weekly') continue;
      var tid2 = TASK_CONFIG[j].id;
      saveData.taskProgress[tid2] = { status: 'locked', progress: 0 };
    }
    saveData.lastWeeklyReset = thisWeek;
    changed = true;
  }
  if (changed) saveSave(saveData);
  refreshTaskUnlockStatus();
}

/** 根据前置关系刷新各任务解锁状态，新解锁时写 unlock 事件 */
function refreshTaskUnlockStatus() {
  if (!saveData || !saveData.taskProgress) return;
  for (var i = 0; i < TASK_CONFIG.length; i++) {
    var task = TASK_CONFIG[i];
    var tid = task.id;
    var prog = saveData.taskProgress[tid];
    if (!prog) saveData.taskProgress[tid] = { status: 'locked', progress: 0 };
    prog = saveData.taskProgress[tid];
    var allPrereqClaimed = true;
    for (var p = 0; p < (task.prerequisiteIds || []).length; p++) {
      var pre = saveData.taskProgress[task.prerequisiteIds[p]];
      if (!pre || pre.status !== 'claimed') { allPrereqClaimed = false; break; }
    }
    var shouldUnlock = allPrereqClaimed;
    if (shouldUnlock && prog.status === 'locked') {
      saveData.taskProgress[tid].status = 'unlocked';
      saveData.taskProgress[tid].unlockedAt = typeof Date.now === 'function' ? Date.now() : 0;
      recordTaskEvent(tid, 'unlock', {});
    }
  }
  saveSave(saveData);
}

var pendingTaskCompleteQueue = []; // 本局内完成的任务 id，用于弹窗「获取奖励」

/** 推进任务进度：objectiveType 与 delta；达标的任务置为 completed 并写 complete 事件 */
function updateTaskProgress(objectiveType, delta) {
  if (!saveData || !saveData.taskProgress || delta <= 0) return;
  var now = typeof Date.now === 'function' ? Date.now() : 0;
  for (var i = 0; i < TASK_CONFIG.length; i++) {
    var task = TASK_CONFIG[i];
    var tid = task.id;
    var prog = saveData.taskProgress[tid];
    if (!prog || prog.status !== 'unlocked') continue;
    var obj = task.objective;
    if (!obj || obj.type !== objectiveType) continue;
    prog.progress = (prog.progress || 0) + delta;
    var target = obj.target || 1;
    if (prog.progress >= target) {
      saveData.taskProgress[tid].status = 'completed';
      saveData.taskProgress[tid].completedAt = now;
      recordTaskEvent(tid, 'complete', { progress: prog.progress, target: target });
      pendingTaskCompleteQueue.push(tid);
    }
  }
  saveSave(saveData);
}

/** 若有待展示的任务完成，弹出「任务完成」弹窗，按钮「获取奖励」点击后发放奖励 */
function showNextTaskCompletePopup() {
  if (!pendingTaskCompleteQueue.length) return;
  var taskId = pendingTaskCompleteQueue.shift();
  var task = TASK_CONFIG.filter(function (t) { return t.id === taskId; })[0];
  if (!task || typeof wx === 'undefined' || !wx.showModal) {
    if (pendingTaskCompleteQueue.length > 0) setTimeout(showNextTaskCompletePopup, 100);
    return;
  }
  var rewardStr = [];
  if (task.rewardGold) rewardStr.push(task.rewardGold + '金币');
  if (task.rewardStamina) rewardStr.push(task.rewardStamina + '体力');
  var rewardDesc = rewardStr.length ? ('\n奖励: ' + rewardStr.join('、')) : '\n奖励: 无';
  var content = task.name + (task.desc ? '\n' + task.desc : '') + rewardDesc;
  wx.showModal({
    title: '任务完成',
    content: content,
    confirmText: '获取奖励',
    showCancel: false,
    success: function (res) {
      if (res.confirm) {
        if (claimTaskReward(taskId) && rewardStr.length) {
          if (wx.showToast) wx.showToast({ title: '获得 ' + rewardStr.join('、'), icon: 'none', duration: 2000 });
        }
      }
      if (pendingTaskCompleteQueue.length > 0) setTimeout(showNextTaskCompletePopup, 100);
    }
  });
}

/** 一局结束（过关或失败）时调用：更新 complete_levels 与 make_4_match 进度；每累计 5 次四连可领取 50 金币，每日最多领取 5 次 */
function onLevelFinished(levelsCompleted, fourMatchCount) {
  if (levelsCompleted > 0) updateTaskProgress('complete_levels', levelsCompleted);
  if (fourMatchCount > 0) updateTaskProgress('make_4_match', fourMatchCount);
  if (fourMatchCount > 0 && saveData) {
    var today = getDateKey();
    if (saveData.fourMatchGoldClaimedDate !== today) {
      saveData.fourMatchGoldClaimedDate = today;
      saveData.fourMatchGoldClaimedToday = 0;
    }
    saveData.fourMatchRewardCounter = (saveData.fourMatchRewardCounter || 0) + fourMatchCount;
    var claimedToday = saveData.fourMatchGoldClaimedToday || 0;
    while (saveData.fourMatchRewardCounter >= 5 && claimedToday < 5) {
      saveData.fourMatchRewardCounter -= 5;
      saveData.fourMatchGoldClaimedToday = claimedToday + 1;
      claimedToday = saveData.fourMatchGoldClaimedToday;
      saveData.gold = (saveData.gold || 0) + 50;
      fourMatchGoldThisGame = (fourMatchGoldThisGame || 0) + 50;
      if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: '任务达成：四连5次，获得50金币！', icon: 'none', duration: 2000 });
      saveSave(saveData);
    }
    while (saveData.fourMatchRewardCounter >= 5) {
      saveData.fourMatchRewardCounter -= 5;
      saveSave(saveData);
    }
    saveSave(saveData);
    persistProgressToCloud();
  }
}

/** 构建用于云端持久化的完整进度对象（金币、任务、四连、关卡、排行相关等） */
function getProgressPayload() {
  if (!saveData) return null;
  return {
    maxUnlockedLevel: saveData.maxUnlockedLevel,
    stars: saveData.stars,
    bestScorePerLevel: saveData.bestScorePerLevel,
    updatedAt: saveData.updatedAt,
    gold: saveData.gold,
    stamina: saveData.stamina,
    lastStaminaTime: saveData.lastStaminaTime,
    taskProgress: saveData.taskProgress,
    taskEvents: saveData.taskEvents,
    lastDailyReset: saveData.lastDailyReset,
    lastWeeklyReset: saveData.lastWeeklyReset,
    sessionActive: saveData.sessionActive,
    resumableLevelId: saveData.resumableLevelId,
    levelStuckCount: saveData.levelStuckCount,
    levelAdjustments: saveData.levelAdjustments,
    fourMatchRewardCounter: saveData.fourMatchRewardCounter,
    fourMatchGoldClaimedDate: saveData.fourMatchGoldClaimedDate,
    fourMatchGoldClaimedToday: saveData.fourMatchGoldClaimedToday
  };
}
/** 将当前进度同步到云端数据库，防止进程关闭后丢失 */
function persistProgressToCloud() {
  if (!currentUserId || typeof dataService === 'undefined' || !dataService.saveProgress) return;
  var payload = getProgressPayload();
  if (payload) dataService.saveProgress(currentUserId, payload, function () {});
}

/** 领取任务奖励；仅 status === 'completed' 可领取。发放金币与体力后置为 claimed 并刷新解锁链 */
function claimTaskReward(taskId) {
  if (!saveData || !saveData.taskProgress) return false;
  var task = TASK_CONFIG.filter(function (t) { return t.id === taskId; })[0];
  if (!task) return false;
  var prog = saveData.taskProgress[taskId];
  if (!prog || prog.status !== 'completed') return false;
  var now = typeof Date.now === 'function' ? Date.now() : 0;
  saveData.gold = (saveData.gold || 0) + (task.rewardGold || 0);
  if ((task.rewardStamina || 0) > 0) addStamina(task.rewardStamina);
  saveData.taskProgress[taskId].status = 'claimed';
  saveData.taskProgress[taskId].claimedAt = now;
  recordTaskEvent(taskId, 'claim_reward', { rewardGold: task.rewardGold, rewardStamina: task.rewardStamina || 0 });
  saveSave(saveData);
  refreshTaskUnlockStatus();
  persistProgressToCloud();
  return true;
}

/** 历史最高总分（各关最佳分之和），用于好友排行上报 */
function getTotalScoreForRank() {
  if (!saveData || !saveData.bestScorePerLevel) return 0;
  var sum = 0;
  for (var k in saveData.bestScorePerLevel) sum += saveData.bestScorePerLevel[k] || 0;
  return sum;
}
/** 历史总星级（各关星级之和），用于好友星级排行上报 */
function getTotalStarsForRank() {
  if (!saveData || !saveData.stars) return 0;
  var sum = 0;
  for (var k in saveData.stars) sum += (saveData.stars[k] || 0);
  return sum;
}
/** 若本关以当前 score 结算，用于排行的总分（实时显示排名用） */
function getPotentialTotalScoreForRank() {
  if (!saveData || !saveData.bestScorePerLevel) return score;
  var total = 0;
  for (var k in saveData.bestScorePerLevel) {
    if (k !== String(currentLevelId)) total += saveData.bestScorePerLevel[k] || 0;
  }
  return total + score;
}
var RANK_KEY = 'score';
var RANK_KEY_LEVEL = 'level';
var RANK_KEY_STARS = 'stars';
var MINIPANEL_W = 200;
var MINIPANEL_H = 52;
var RANK_PANEL_EXTRA = 22; // 排名面板下方显示总得分的高度
var lastMinipanelScoreSent = -1;
/** 对局中用于排名展示的得分（仅关卡开始/通关/失败时更新，连续消除时不刷新） */
var rankDisplayScore = 0;
var lastShareImagePath = ''; // 最近一次截图路径，供分享到聊天/朋友圈使用
var shareIntentTime = 0;     // 用户触发分享的时间，用于 onShow 回退计入分享任务
var shareTaskCountedThisSession = false; // 本次分享流程是否已计入任务，避免 success 与 onShow 重复

/** 仅在本轮分享流程中计入一次分享任务进度（success 或 onShow 谁先触发谁生效） */
function tryCountShareTask() {
  if (shareTaskCountedThisSession) return;
  shareTaskCountedThisSession = true;
  updateTaskProgress('share', 1);
}

function updateRankMinipanel(scoreForRank) {
  if (scoreForRank == null || scoreForRank < 0) return;
  var s = Math.floor(scoreForRank);
  if (s === lastMinipanelScoreSent) return;
  lastMinipanelScoreSent = s;
  try {
    var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
    if (openCtx && openCtx.canvas) {
      openCtx.canvas.width = MINIPANEL_W;
      openCtx.canvas.height = MINIPANEL_H;
      openCtx.postMessage({ type: 'minipanel', score: s });
    }
  } catch (e) {}
}
var saveData = null; // 启动时由 main() 赋值为 loadSave()
function submitScoreForRank(scoreForRank) {
  try {
    if (!wx.setUserCloudStorage) return;
    var list = [];
    if (typeof scoreForRank === 'number') list.push({ key: RANK_KEY, value: String(Math.max(0, Math.floor(scoreForRank))) });
    var lv = saveData && typeof saveData.maxUnlockedLevel === 'number' ? saveData.maxUnlockedLevel : 0;
    list.push({ key: RANK_KEY_LEVEL, value: String(Math.max(0, lv)) });
    var st = getTotalStarsForRank();
    list.push({ key: RANK_KEY_STARS, value: String(Math.max(0, st)) });
    wx.setUserCloudStorage({ KVDataList: list });
  } catch (e) {}
}

/** 将当前画布导出为截图，然后弹出「分享给好友」/「分享到朋友圈」选择，直接进入对应分享流程 */
function doShareScreenshot() {
  if (typeof wx === 'undefined' || !wx.canvasToTempFilePath) return;
  try {
    var w = canvas.width || 375;
    var h = canvas.height || 375;
    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0,
      y: 0,
      width: w,
      height: h,
      destWidth: w,
      destHeight: h,
      fileType: 'png',
      success: function (res) {
        lastShareImagePath = res.tempFilePath;
        wx.showActionSheet({
          itemList: ['分享给好友', '分享到朋友圈'],
          success: function (actionRes) {
            if (actionRes.tapIndex === 0) {
              shareIntentTime = Date.now();
              shareTaskCountedThisSession = false;
              wx.shareAppMessage({
                title: '萌兽三消',
                imageUrl: lastShareImagePath,
                success: function () { tryCountShareTask(); }
              });
            } else if (actionRes.tapIndex === 1) {
              if (wx.showModal) {
                wx.showModal({
                  title: '分享到朋友圈',
                  content: '请点击屏幕右上角「···」菜单，选择「分享到朋友圈」即可分享当前截图。',
                  showCancel: false,
                  confirmText: '知道了'
                });
              } else if (wx.showToast) {
                wx.showToast({ title: '请点击右上角···选择「分享到朋友圈」', icon: 'none', duration: 2500 });
              }
            }
          }
        });
      },
      fail: function () {
        if (wx.showToast) wx.showToast({ title: '截图失败', icon: 'none' });
      }
    });
  } catch (e) {
    if (wx.showToast) wx.showToast({ title: '分享失败', icon: 'none' });
  }
}
var saveData = null; // 启动时由 main() 赋值为 loadSave()

function getLevelConfig(levelId) {
  if (levelId < 1) return null;
  var config = generateLevelConfig(levelId);
  if (!config.goals) config.goals = [{ type: 'score', value: config.targetScore != null ? config.targetScore : 500 }];
  return config;
}

// 阶段五：星级阈值（分数达线即 2 星/3 星），缺省按目标分倍数
function getStarThresholds(config) {
  var base = config.targetScore;
  if (base == null && config.goals) {
    for (var i = 0; i < config.goals.length; i++) {
      if (config.goals[i].type === 'score') { base = config.goals[i].value; break; }
    }
  }
  if (base == null) base = 500;
  return {
    star2Score: config.star2Score != null ? config.star2Score : Math.floor(base * 1.2),
    star3Score: config.star3Score != null ? config.star3Score : Math.floor(base * 1.5)
  };
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
var pendingFailRecord = false; // 步数用尽时先只弹窗，用户选重试/返回再写入失败记录，以便支持「50金买3步」
var lastEarnedStars = 0; // 本局过关获得的星级 1～3，供胜利面板与存档用
var gameScene = 'start'; // 'start' | 'play' | 'rank' | 'tasks'
var comboIndex = 0; // 连消序号，用于计分加成
var levelStartTime = 0; // 本关开始时间戳，用于通关时间与时间加分
var initialMovesForLevel = 20; // 本关总步数，用于记录使用步数
var elim3Count = 0;
var elim4Count = 0;
var elim5Count = 0;
var elim6PlusCount = 0; // 本局 3/4/5/6+ 消次数，供对局记录与后台调阅
var fourMatchGoldThisGame = 0; // 本局四连已获得的金币数（每5次四连50金）
var wallGrid = []; // wallGrid[r][c] === true 表示墙
var iceGrid = []; // iceGrid[r][c] 为冰块血量，0 表示无

// 交换动画：两格互换
let swapAnim = null; // { r1, c1, r2, c2, progress }

// 消除动画
let eliminateAnim = null; // { matches: [{row,col}], progress }

// 消除粒子（飞散小粒）
let eliminateParticles = [];

// 连消文字
let comboText = null; // { text: 'COMBO x2', progress }

// 屏震（连消时 1～2 帧）
var screenShakeFrames = 0;
var screenShakeX = 0;
var screenShakeY = 0;

// 直线消除火焰效果：{ row, col, dir: 'h'|'v', progress }
var lineEffects = [];
var DUR_LINE_FLAME = 0.4;
// 炸弹爆炸火焰效果：{ row, col, progress }
var bombEffects = [];
var DUR_BOMB_FLAME = 0.45;

// 下落动画
let dropAnims = []; // { fromR, fromC, toR, toC, type, progress }

// 填充动画（新块从顶部落入）
let fillAnims = []; // { r, c, type, progress }

let lastTime = 0;
let animating = false;

// 音效（阶段四）：需在项目内放置 sounds/swap.mp3 等，首次播放需在用户触摸后
var soundContexts = {};
var SOUND_URLS = { swap: 'sounds/swap.mp3', eliminate: 'sounds/eliminate.mp3', combo: 'sounds/combo.mp3', win: 'sounds/win.mp3', fail: 'sounds/fail.mp3' };
function playSound(type) {
  if (!wx.createInnerAudioContext || !SOUND_URLS[type]) return;
  try {
    var ctx = soundContexts[type];
    if (!ctx) {
      ctx = wx.createInnerAudioContext();
      ctx.src = SOUND_URLS[type];
      soundContexts[type] = ctx;
    }
    ctx.seek(0);
    ctx.play();
  } catch (e) {}
}

function updateSafeAreaInsets(w, h) {
  safeInsetTop = 0;
  safeInsetBottom = 0;
  safeInsetLeft = 0;
  safeInsetRight = 0;
  try {
    var sys = wx.getSystemInfoSync();
    if (sys.safeArea) {
      var s = sys.safeArea;
      var wh = h || sys.windowHeight || 0;
      var ww = w || sys.windowWidth || 0;
      safeInsetTop = s.top != null ? s.top : 0;
      safeInsetBottom = wh - (s.bottom != null ? s.bottom : wh);
      safeInsetLeft = s.left != null ? s.left : 0;
      safeInsetRight = ww - (s.right != null ? s.right : ww);
    } else if (sys.safeAreaInsets) {
      var si = sys.safeAreaInsets;
      safeInsetTop = si.top != null ? si.top : 0;
      safeInsetBottom = si.bottom != null ? si.bottom : 0;
      safeInsetLeft = si.left != null ? si.left : 0;
      safeInsetRight = si.right != null ? si.right : 0;
    }
  } catch (e) {}
  contentX = safeInsetLeft;
  contentY = safeInsetTop;
  contentWidth = Math.max(1, w - safeInsetLeft - safeInsetRight);
  contentHeight = Math.max(1, h - safeInsetTop - safeInsetBottom);
}

/** 根据当前画布尺寸更新布局（体验版/真机画布可能未就绪，用系统尺寸兜底并回写画布） */
function updateLayout() {
  var w = canvas && canvas.width ? canvas.width : 0;
  var h = canvas && canvas.height ? canvas.height : 0;
  if (!w || w <= 0 || !h || h <= 0) {
    try {
      var sys = wx.getSystemInfoSync();
      w = sys.windowWidth || 375;
      h = sys.windowHeight || 375;
    } catch (e) {}
    w = w || 375;
    h = h || 375;
    if (canvas) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  updateSafeAreaInsets(w, h);
  var hudTop = HUD_TOP_MARGIN + (safeInsetTop > 20 ? HUD_SAFE_TOP_EXTRA : 0);
  var playH = contentHeight - hudTop - (safeInsetBottom > 0 ? Math.min(safeInsetBottom, 40) : 0);
  if (playH <= 0) playH = contentHeight * 0.7;
  cellSize = Math.min(contentWidth, playH) / 8;
  if (cellSize <= 0) cellSize = Math.min(contentWidth, contentHeight) / 8;
  offsetX = contentX + (contentWidth - cellSize * COLS) / 2;
  offsetY = contentY + hudTop + (playH - cellSize * ROWS) / 2;
}

function loadBackgroundImage() {
  if (bgImage && bgImage.width) return;
  try {
    var img = (typeof wx !== 'undefined' && wx.createImage) ? wx.createImage() : (typeof Image !== 'undefined' ? new Image() : null);
    if (!img) return;
    img.onload = function () { bgImage = img; };
    img.onerror = function () {};
    img.src = 'images/bg.png';
  } catch (e) {}
}

function initCanvas() {
  canvas = wx.createCanvas();
  ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  if (!w || w <= 0 || !h || h <= 0) {
    try {
      var sys = wx.getSystemInfoSync();
      w = sys.windowWidth || 375;
      h = sys.windowHeight || 375;
    } catch (e) {}
    w = w || 375;
    h = h || 375;
    canvas.width = w;
    canvas.height = h;
  }
  updateLayout();
}

/** 加载 images/gem_0.png ~ gem_4.png，与背景图相同方式：createImage + src 直接路径，不经过 readFile/writeFile */
function loadGemImages() {
  if (!USE_SIMPLE_GRID || GEM_IMAGES.length > 0) return;
  for (var i = 0; i < GEM_TYPES; i++) {
    GEM_IMAGES[i] = null;
  }
  var createImg = (typeof wx !== 'undefined' && wx.createImage) ? function () { return wx.createImage(); } : (typeof Image !== 'undefined' ? function () { return new Image(); } : null);
  if (!createImg) return;
  for (var i = 0; i < GEM_TYPES; i++) {
    (function (idx) {
      try {
        var img = createImg();
        img.onload = function () { GEM_IMAGES[idx] = img; };
        img.onerror = function () { GEM_IMAGES[idx] = null; };
        if (img.onLoad !== undefined) img.onLoad = img.onload;
        img.src = 'images/gem_' + idx + '.png';
      } catch (e) {
        GEM_IMAGES[idx] = null;
      }
    })(i);
  }
  if (GEM_IMAGES_BASE_URL && typeof wx !== 'undefined' && wx.downloadFile) {
    setTimeout(function () {
      for (var di = 0; di < GEM_TYPES; di++) {
        if (GEM_IMAGES[di]) continue;
        (function (idx) {
          var url = GEM_IMAGES_BASE_URL.replace(/\/$/, '') + '/gem_' + idx + '.png';
          wx.downloadFile({
            url: url,
            success: function (res) {
              if (!res || !res.tempFilePath) return;
              var img = createImg();
              img.onerror = function () { GEM_IMAGES[idx] = null; };
              img.onload = function () { GEM_IMAGES[idx] = img; };
              if (img.onLoad !== undefined) img.onLoad = img.onload;
              img.src = res.tempFilePath;
            },
            fail: function () {}
          });
        })(di);
      }
    }, 1500);
  }
}

/** 当前关卡色块权重（用于卡关时增加某色比例），返回长度为 GEM_TYPES 的数组 */
function getGemWeightsForLevel(levelId) {
  var w = [];
  for (var i = 0; i < GEM_TYPES; i++) w[i] = 1;
  if (!saveData || !saveData.levelAdjustments) return w;
  var adj = saveData.levelAdjustments[levelId];
  if (!adj) return w;
  if (typeof adj.scoreColor === 'number' && adj.scoreColor >= 0 && adj.scoreColor < GEM_TYPES && (adj.scoreFactor || 1) > 0) {
    w[adj.scoreColor] = w[adj.scoreColor] * (adj.scoreFactor || 1);
  }
  if (adj.collectFactors && typeof adj.collectFactors === 'object') {
    for (var c = 0; c < GEM_TYPES; c++) {
      if (adj.collectFactors[c] > 0) w[c] = w[c] * adj.collectFactors[c];
    }
  }
  return w;
}

/** 按权重随机返回 0..GEM_TYPES-1 */
function weightedRandomGem(weights) {
  var sum = 0;
  for (var i = 0; i < GEM_TYPES; i++) sum += weights[i] || 1;
  var r = Math.random() * sum;
  for (var j = 0; j < GEM_TYPES; j++) {
    r -= weights[j] || 1;
    if (r < 0) return j;
  }
  return GEM_TYPES - 1;
}

function initGrid() {
  var weights = getGemWeightsForLevel(currentLevelId);
  do {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = weightedRandomGem(weights);
      }
    }
  } while (getMatches().length > 0);
}

function initGridFromData(gridData) {
  var weights = getGemWeightsForLevel(currentLevelId);
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      var val = gridData[r][c];
      grid[r][c] = typeof val === 'number' && val >= 0 && val < GEM_TYPES ? val : weightedRandomGem(weights);
    }
  }
}

function startLevel(levelId) {
  var config = getLevelConfig(levelId);
  if (!config) return;
  if (saveData) {
    saveData.resumableLevelId = levelId;
    saveSave(saveData);
  }
  lastMinipanelScoreSent = -1;
  currentLevelId = levelId;
  movesLeft = config.moves;
  initialMovesForLevel = config.moves;
  levelStartTime = typeof Date.now === 'function' ? Date.now() : 0;
  score = 0;
  elim3Count = 0;
  elim4Count = 0;
  elim5Count = 0;
  elim6PlusCount = 0;
  fourMatchGoldThisGame = 0;
  rankDisplayScore = getTotalScoreForRank();
  lastMinipanelScoreSent = -1;
  try {
    var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
    if (openCtx && openCtx.canvas) {
      openCtx.canvas.width = MINIPANEL_W;
      openCtx.canvas.height = MINIPANEL_H;
      openCtx.postMessage({ type: 'minipanel', score: Math.floor(rankDisplayScore) });
    }
  } catch (e) {}
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
  pendingFailRecord = false;
  comboIndex = 0;
  state = 'idle';
  swapAnim = null;
  eliminateAnim = null;
  eliminateParticles = [];
  comboText = null;
  screenShakeFrames = 0;
  lineEffects = [];
  bombEffects = [];
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
  if (config.walls && config.walls.length) {
    var weights = getGemWeightsForLevel(currentLevelId);
    for (var i = 0; i < config.walls.length; i++) {
      var w = config.walls[i];
      if (w[0] >= 0 && w[0] < ROWS && w[1] >= 0 && w[1] < COLS) {
        wallGrid[w[0]][w[1]] = false;
        grid[w[0]][w[1]] = weightedRandomGem(weights);
        iceGrid[w[0]][w[1]] = 1;
      }
    }
  }
  render();
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(playRenderLoop);
}

function playRenderLoop() {
  if (gameScene !== 'play') return;
  if (state !== 'idle') {
    requestAnimationFrame(playRenderLoop);
    return;
  }
  render();
  requestAnimationFrame(playRenderLoop);
}

/** 是否可参与三连判定（有冰的格子也可参与消除，但不可移动） */
function isMatchable(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  var v = grid[r][c];
  if (v < 0 || v >= GEM_TYPES) return false;
  return true;
}

function getMatches() {
  const set = new Set();
  const add = (r, c) => set.add(r + ',' + c);
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && isMatchable(r, c) && isMatchable(r, c - 1) && grid[r][c] === grid[r][c - 1];
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
      const same = r < ROWS && isMatchable(r, c) && isMatchable(r - 1, c) && grid[r][c] === grid[r - 1][c];
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

/** 从当前匹配结果得到「横/竖 run」列表，用于判定四连、五连、L/T。只根据 matches 中的连续段判定，不依赖整行/整列同色。 */
function getMatchRuns(matches) {
  var key = function (r, c) { return r + ',' + c; };
  var inMatch = {};
  for (var i = 0; i < matches.length; i++) { inMatch[key(matches[i].row, matches[i].col)] = true; }
  var runs = [];
  var byRow = {};
  var byCol = {};
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var r = m.row, c = m.col;
    if (!byRow[r]) byRow[r] = [];
    byRow[r].push(c);
    if (!byCol[c]) byCol[c] = [];
    byCol[c].push(r);
  }
  for (var r in byRow) {
    byRow[r].sort(function (a, b) { return a - b; });
    var cols = byRow[r];
    var start = 0;
    for (var i = 1; i <= cols.length; i++) {
      if (i === cols.length || cols[i] !== cols[i - 1] + 1) {
        var len = i - start;
        if (len >= 3) {
          var cells = [];
          for (var j = start; j < i; j++) cells.push({ row: +r, col: cols[j] });
          runs.push({ dir: 'h', len: len, cells: cells });
        }
        start = i;
      }
    }
  }
  for (var c in byCol) {
    byCol[c].sort(function (a, b) { return a - b; });
    var rows = byCol[c];
    var start = 0;
    for (var i = 1; i <= rows.length; i++) {
      if (i === rows.length || rows[i] !== rows[i - 1] + 1) {
        var len = i - start;
        if (len >= 3) {
          var cells = [];
          for (var j = start; j < i; j++) cells.push({ row: rows[j], col: +c });
          runs.push({ dir: 'v', len: len, cells: cells });
        }
        start = i;
      }
    }
  }
  return runs;
}

/** 根据 runs 决定哪些格生成特殊块：五连/相交 -> bomb，四连 -> line */
function getSpecialSpawns(matches, runs) {
  var bombSet = {};
  var lineMap = {};
  var key = function (r, c) { return r + ',' + c; };
  for (var i = 0; i < runs.length; i++) {
    var run = runs[i];
    var len = Number(run.len);
    if (run.cells.length < 3) continue;
    var mid = Math.floor(run.cells.length / 2);
    var center = run.cells[mid];
    var rc = key(center.row, center.col);
    if (len >= 5) bombSet[rc] = true;
    else if (len === 4) lineMap[rc] = run.dir === 'h' ? 'lineH' : 'lineV';
  }
  var inHRun = {}, inVRun = {};
  for (var i = 0; i < runs.length; i++) {
    var run = runs[i];
    for (var j = 0; j < run.cells.length; j++) {
      var c = run.cells[j];
      var rc = key(c.row, c.col);
      if (run.dir === 'h') inHRun[rc] = true; else inVRun[rc] = true;
    }
  }
  for (var rc in inHRun) { if (inHRun[rc] && inVRun[rc]) bombSet[rc] = true; }
  if (matches.length >= 5) {
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var r = m.row, c = m.col;
      var sameRow = 0, sameCol = 0;
      for (var j = 0; j < matches.length; j++) {
        if (matches[j].row === r) sameRow++;
        if (matches[j].col === c) sameCol++;
      }
      if (sameRow >= 2 && sameCol >= 2) bombSet[key(r, c)] = true;
    }
  }
  var result = { line: [], bomb: [] };
  for (var rc in bombSet) {
    var p = rc.split(',');
    result.bomb.push({ row: +p[0], col: +p[1] });
  }
  for (var rc in lineMap) {
    if (bombSet[rc]) continue;
    var p = rc.split(',');
    result.line.push({ row: +p[0], col: +p[1], dir: lineMap[rc] });
  }
  return result;
}

/** 触发场上所有特殊块，返回应被消除的格子列表（含特殊格及其影响范围） */
function triggerSpecials() {
  var toRemove = {};
  var key = function (r, c) { return r + ',' + c; };
  var add = function (r, c) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !isWall(r, c)) toRemove[key(r, c)] = { row: r, col: c };
  };
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var v = grid[r][c];
      if (v === LINE_H) { for (var col = 0; col < COLS; col++) add(r, col); }
      else if (v === LINE_V) { for (var row = 0; row < ROWS; row++) add(row, c); }
      else if (v === BOMB) {
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
      }
    }
  }
  return Object.keys(toRemove).map(function (k) { var p = k.split(','); return { row: +p[0], col: +p[1] }; });
}

function swap(r1, c1, r2, c2) {
  if (isWall(r1, c1) || isWall(r2, c2)) return;
  const t = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = t;
  var i1 = iceGrid[r1] && iceGrid[r1][c1];
  var i2 = iceGrid[r2] && iceGrid[r2][c2];
  if (iceGrid[r1]) iceGrid[r1][c1] = i2 || 0;
  if (iceGrid[r2]) iceGrid[r2][c2] = i1 || 0;
}

function isAdjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function thawNeighbors(r, c) {
  var dr = [-1, 1, 0, 0], dc = [0, 0, -1, 1];
  for (var i = 0; i < 4; i++) {
    var nr = r + dr[i], nc = c + dc[i];
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !isWall(nr, nc) && iceGrid[nr] && iceGrid[nr][nc] > 0) {
      iceGrid[nr][nc] = 0;
    }
  }
}

function removeMatches(matches, specialSpawns) {
  var bombKey = {};
  var lineKey = {};
  if (specialSpawns) {
    for (var i = 0; i < specialSpawns.bomb.length; i++) {
      var b = specialSpawns.bomb[i];
      bombKey[b.row + ',' + b.col] = true;
    }
    for (var i = 0; i < specialSpawns.line.length; i++) {
      var l = specialSpawns.line[i];
      lineKey[l.row + ',' + l.col] = l.dir;
    }
  }
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var r = m.row, c = m.col;
    var key = r + ',' + c;
    thawNeighbors(r, c);
    if (iceGrid[r]) iceGrid[r][c] = 0;
    if (specialSpawns && bombKey[key]) { grid[r][c] = BOMB; continue; }
    if (specialSpawns && lineKey[key]) {
      grid[r][c] = lineKey[key] === 'lineH' ? LINE_H : LINE_V;
      continue;
    }
    grid[r][c] = -1;
  }
}

function removeCells(cells) {
  for (var i = 0; i < cells.length; i++) {
    var r = cells[i].row, c = cells[i].col;
    thawNeighbors(r, c);
    if (iceGrid[r]) iceGrid[r][c] = 0;
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
  var weights = getGemWeightsForLevel(currentLevelId);
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (!isWall(r, c) && grid[r][c] < 0 && (iceGrid[r][c] || 0) === 0) grid[r][c] = weightedRandomGem(weights);
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
  var weights = getGemWeightsForLevel(currentLevelId);
  fillAnims = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (!isWall(r, c) && grid[r][c] < 0 && (iceGrid[r][c] || 0) === 0) {
        var type = weightedRandomGem(weights);
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
  if (gameScene === 'start' || gameScene === 'rank') return;
  if (state !== 'idle') return;
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  const x = touch.clientX != null ? touch.clientX : touch.x;
  const y = touch.clientY != null ? touch.clientY : touch.y;
  touchStartCell = getCellFromTouch(x, y);
  if (touchStartCell && isWall(touchStartCell.row, touchStartCell.col)) touchStartCell = null;
  if (touchStartCell && iceGrid[touchStartCell.row] && iceGrid[touchStartCell.row][touchStartCell.col] > 0) touchStartCell = null;
  touchStartX = x;
  touchStartY = y;
}

function onTouchEnd(e) {
  const touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  const endX = touch.clientX != null ? touch.clientX : touch.x;
  const endY = touch.clientY != null ? touch.clientY : touch.y;
  if (gameScene === 'start') {
    if (btnStartContinueRect && endX >= btnStartContinueRect.x && endX <= btnStartContinueRect.x + btnStartContinueRect.w && endY >= btnStartContinueRect.y && endY <= btnStartContinueRect.y + btnStartContinueRect.h) {
      var canResume = saveData && saveData.sessionActive === true && saveData.resumableLevelId >= 1;
      if (canResume) {
        gameScene = 'play';
        startLevel(saveData.resumableLevelId);
        return;
      }
      tryConsumeStaminaOrBuyAndRun(function () {
        if (saveData) {
          saveData.sessionActive = true;
          saveData.resumableLevelId = (saveData.maxUnlockedLevel >= 1) ? saveData.maxUnlockedLevel : 1;
          saveSave(saveData);
        }
        gameScene = 'play';
        var startLevelId = saveData && saveData.maxUnlockedLevel >= 1 ? saveData.maxUnlockedLevel : 1;
        startLevel(startLevelId);
      });
      return;
    }
    if (btnRankRect && endX >= btnRankRect.x && endX <= btnRankRect.x + btnRankRect.w && endY >= btnRankRect.y && endY <= btnRankRect.y + btnRankRect.h) {
      openRankPanel();
      return;
    }
    if (btnTaskRect && endX >= btnTaskRect.x && endX <= btnTaskRect.x + btnTaskRect.w && endY >= btnTaskRect.y && endY <= btnTaskRect.y + btnTaskRect.h) {
      gameScene = 'tasks';
      tasksLoop();
      return;
    }
    if (btnShareRect && endX >= btnShareRect.x && endX <= btnShareRect.x + btnShareRect.w && endY >= btnShareRect.y && endY <= btnShareRect.y + btnShareRect.h) {
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        shareIntentTime = Date.now();
        shareTaskCountedThisSession = false;
        wx.shareAppMessage({
          title: '萌兽三消',
          imageUrl: lastShareImagePath || '',
          success: function () { tryCountShareTask(); }
        });
      }
      return;
    }
    return;
  }
  if (gameScene === 'rank') {
    if (btnRankCloseRect && endX >= btnRankCloseRect.x && endX <= btnRankCloseRect.x + btnRankCloseRect.w && endY >= btnRankCloseRect.y && endY <= btnRankCloseRect.y + btnRankCloseRect.h) {
      gameScene = 'start';
      btnRankCloseRect = null;
      renderStart();
      return;
    }
    if (btnRankFriendRect && endX >= btnRankFriendRect.x && endX <= btnRankFriendRect.x + btnRankFriendRect.w && endY >= btnRankFriendRect.y && endY <= btnRankFriendRect.y + btnRankFriendRect.h) {
      rankTab = 'friend';
      return;
    }
    if (btnRankGlobalRect && endX >= btnRankGlobalRect.x && endX <= btnRankGlobalRect.x + btnRankGlobalRect.w && endY >= btnRankGlobalRect.y && endY <= btnRankGlobalRect.y + btnRankGlobalRect.h) {
      rankTab = 'global';
      if (globalRankList.length === 0 && !globalRankLoading && typeof dataService !== 'undefined' && dataService.getGlobalRank) {
        globalRankLoading = true;
        dataService.getGlobalRank(function (res) {
          globalRankLoading = false;
          globalRankList = (res && res.list) ? res.list : [];
        });
      }
      return;
    }
    if (rankTab === 'friend') {
      if (btnRankScoreRect && endX >= btnRankScoreRect.x && endX <= btnRankScoreRect.x + btnRankScoreRect.w && endY >= btnRankScoreRect.y && endY <= btnRankScoreRect.y + btnRankScoreRect.h) {
        friendRankType = 'score';
        try {
          var oc = wx.getOpenDataContext && wx.getOpenDataContext();
          if (oc) oc.postMessage({ type: 'refresh', rankType: 'score' });
        } catch (e) {}
        return;
      }
      if (btnRankLevelRect && endX >= btnRankLevelRect.x && endX <= btnRankLevelRect.x + btnRankLevelRect.w && endY >= btnRankLevelRect.y && endY <= btnRankLevelRect.y + btnRankLevelRect.h) {
        friendRankType = 'level';
        try {
          var oc2 = wx.getOpenDataContext && wx.getOpenDataContext();
          if (oc2) oc2.postMessage({ type: 'refresh', rankType: 'level' });
        } catch (e) {}
        return;
      }
      if (btnRankStarsRect && endX >= btnRankStarsRect.x && endX <= btnRankStarsRect.x + btnRankStarsRect.w && endY >= btnRankStarsRect.y && endY <= btnRankStarsRect.y + btnRankStarsRect.h) {
        friendRankType = 'stars';
        try {
          var oc3 = wx.getOpenDataContext && wx.getOpenDataContext();
          if (oc3) oc3.postMessage({ type: 'refresh', rankType: 'stars' });
        } catch (e) {}
        return;
      }
    }
    return;
  }
  if (gameScene === 'tasks') {
    if (btnTaskCloseRect && endX >= btnTaskCloseRect.x && endX <= btnTaskCloseRect.x + btnTaskCloseRect.w && endY >= btnTaskCloseRect.y && endY <= btnTaskCloseRect.y + btnTaskCloseRect.h) {
      gameScene = 'start';
      btnTaskCloseRect = null;
      taskClaimRects = [];
      renderStart();
      return;
    }
    for (var ti = 0; ti < taskClaimRects.length; ti++) {
      var tr = taskClaimRects[ti];
      if (endX >= tr.x && endX <= tr.x + tr.w && endY >= tr.y && endY <= tr.y + tr.h && claimTaskReward(tr.taskId)) {
        if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: '领取成功', icon: 'success' });
        renderTasks();
        return;
      }
    }
    return;
  }
  if (gameScene === 'play' && btnBackToMainRect && endX >= btnBackToMainRect.x && endX <= btnBackToMainRect.x + btnBackToMainRect.w && endY >= btnBackToMainRect.y && endY <= btnBackToMainRect.y + btnBackToMainRect.h) {
    if (saveData) {
      saveData.resumableLevelId = currentLevelId;
      saveSave(saveData);
    }
    gameScene = 'start';
    renderStart();
    return;
  }
  if (state !== 'idle') return;
  if (overlay === 'win' || overlay === 'fail') {
    handleOverlayTouch(e);
    return;
  }
  if (movesLeft <= 0) return;

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
  if ((iceGrid[r1] && iceGrid[r1][c1] > 0) || (iceGrid[r2] && iceGrid[r2][c2] > 0)) return;

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
  playSound('swap');
  if (!animating) requestAnimationFrame(gameLoop);
}

function onTouchCancel() {
  clearTouch();
}

var btnNextRect = null;
var btnRetryRect = null;
var btnBuyStepsRect = null;
var btnMapRect = null;

/** 步数用尽后用户选择重试/返回时写入失败记录并上报（选「50金买3步」不调用） */
function applyFailRecord() {
  if (!pendingFailRecord || !saveData) return;
  pendingFailRecord = false;
  if (!saveData.levelStuckCount) saveData.levelStuckCount = {};
  if (!saveData.levelAdjustments) saveData.levelAdjustments = {};
  saveData.levelStuckCount[currentLevelId] = (saveData.levelStuckCount[currentLevelId] || 0) + 1;
  if (saveData.levelStuckCount[currentLevelId] >= 5) {
    var adj = saveData.levelAdjustments[currentLevelId] || {};
    if (!adj.collectFactors) adj.collectFactors = {};
    var goalColors = [];
    if (currentGoals && currentGoals.length) {
      for (var gx = 0; gx < currentGoals.length; gx++) {
        if (currentGoals[gx].type === 'collect' && currentGoals[gx].color >= 0 && currentGoals[gx].color < GEM_TYPES) {
          if (goalColors.indexOf(currentGoals[gx].color) < 0) goalColors.push(currentGoals[gx].color);
        }
      }
    }
    if (goalColors.length === 0) goalColors = [0];
    for (var k = 0; k < goalColors.length; k++) {
      var c = goalColors[k];
      adj.collectFactors[c] = (adj.collectFactors[c] || 1) * 1.1;
    }
    saveData.levelAdjustments[currentLevelId] = adj;
    saveData.levelStuckCount[currentLevelId] = 0;
  }
  var durationMs = (typeof Date.now === 'function' ? Date.now() : 0) - levelStartTime;
  var durationSec = Math.max(0, durationMs / 1000);
  if (!saveData.gameRecords) saveData.gameRecords = [];
  var recordFail = {
    levelId: currentLevelId,
    durationSec: Math.round(durationSec * 100) / 100,
    movesUsed: initialMovesForLevel - movesLeft,
    totalMoves: initialMovesForLevel,
    score: score,
    stars: 0,
    elim3: elim3Count,
    elim4: elim4Count,
    elim5: elim5Count,
    elim6Plus: elim6PlusCount,
    win: false,
    timestamp: typeof Date.now === 'function' ? Date.now() : 0
  };
  saveData.gameRecords.push(recordFail);
  saveData.updatedAt = typeof Date.now === 'function' ? Date.now() : 0;
  saveSave(saveData);
  setTimeout(showNextTaskCompletePopup, 300);
  persistProgressToCloud();
  if (currentUserId && typeof dataService !== 'undefined' && dataService.submitRecord) {
    dataService.submitRecord(currentUserId, recordFail, function () {});
  }
}

function handleOverlayTouch(e) {
  var touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  var x = touch.clientX != null ? touch.clientX : touch.x;
  var y = touch.clientY != null ? touch.clientY : touch.y;
  if (btnMapRect && x >= btnMapRect.x && x <= btnMapRect.x + btnMapRect.w && y >= btnMapRect.y && y <= btnMapRect.y + btnMapRect.h) {
    if (overlay === 'fail' && pendingFailRecord) applyFailRecord();
    if (saveData) {
      saveData.resumableLevelId = overlay === 'win' ? currentLevelId + 1 : currentLevelId;
      saveSave(saveData);
    }
    overlay = null;
    gameScene = 'start';
    renderStart();
    return;
  }
  if (overlay === 'fail' && btnBuyStepsRect && x >= btnBuyStepsRect.x && x <= btnBuyStepsRect.x + btnBuyStepsRect.w && y >= btnBuyStepsRect.y && y <= btnBuyStepsRect.y + btnBuyStepsRect.h) {
    if (saveData && (saveData.gold || 0) >= 50) {
      saveData.gold -= 50;
      movesLeft = 3;
      overlay = null;
      btnBuyStepsRect = null;
      saveSave(saveData);
      persistProgressToCloud();
      if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: '已购买3步', icon: 'none' });
      render();
    } else if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: '金币不足（需50）', icon: 'none' });
    }
    return;
  }
  if (overlay === 'win' && btnNextRect && x >= btnNextRect.x && x <= btnNextRect.x + btnNextRect.w && y >= btnNextRect.y && y <= btnNextRect.y + btnNextRect.h) {
    startLevel(currentLevelId + 1);
  } else if (overlay === 'fail' && btnRetryRect && x >= btnRetryRect.x && x <= btnRetryRect.x + btnRetryRect.w && y >= btnRetryRect.y && y <= btnRetryRect.y + btnRetryRect.h) {
    if (pendingFailRecord) applyFailRecord();
    tryConsumeStaminaOrBuyAndRun(function () { startLevel(currentLevelId); });
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
      eliminateParticles = spawnEliminateParticles(eliminateAnim.matches);
      if (comboIndex >= 1) {
        comboText = { text: 'COMBO x' + (comboIndex + 1), progress: 0 };
        screenShakeFrames = 2;
        screenShakeX = (Math.random() - 0.5) * 4;
        screenShakeY = (Math.random() - 0.5) * 4;
      }
      playSound(comboIndex >= 1 ? 'combo' : 'eliminate');
    }
  }

  if (state === 'eliminating' && eliminateAnim) {
    eliminateAnim.progress += dt / DUR_ELIMINATE;
    if (eliminateAnim.progress >= 1) {
      comboIndex++;
      var matchLen = eliminateAnim.matches.length;
      if (matchLen === 3) elim3Count++;
      else if (matchLen === 4) elim4Count++;
      else if (matchLen === 5) elim5Count++;
      else if (matchLen >= 6) elim6PlusCount++;
      var matchCells = eliminateAnim.matches.map(function (m) { return { row: m.row, col: m.col }; });
      var runs = getMatchRuns(eliminateAnim.matches);
      var specialSpawns = getSpecialSpawns(eliminateAnim.matches, runs);
      var addScore = matchLen * 10 * comboIndex;
      score += addScore;
      for (var i = 0; i < eliminateAnim.matches.length; i++) {
        var m = eliminateAnim.matches[i];
        if (m.type >= 0 && m.type < GEM_TYPES) {
          var key = 'collect_' + m.type;
          goalProgress[key] = (goalProgress[key] || 0) + 1;
        }
      }
      removeMatches(matchCells, specialSpawns);
      var toRemove = triggerSpecials();
      if (toRemove.length > 0) {
        var seenH = {}, seenV = {};
        for (var rr = 0; rr < ROWS; rr++) {
          for (var cc = 0; cc < COLS; cc++) {
            if (grid[rr][cc] === LINE_H && !seenH[rr]) {
              seenH[rr] = true;
              lineEffects.push({ row: rr, col: cc, dir: 'h', progress: 0 });
            } else if (grid[rr][cc] === LINE_V && !seenV[cc]) {
              seenV[cc] = true;
              lineEffects.push({ row: rr, col: cc, dir: 'v', progress: 0 });
            } else if (grid[rr][cc] === BOMB) {
              bombEffects.push({ row: rr, col: cc, progress: 0 });
            }
          }
        }
        var specialCount = specialSpawns.bomb.length + specialSpawns.line.length;
        score += (toRemove.length - specialCount) * 10 * comboIndex;
        removeCells(toRemove);
      }
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
        eliminateAnim = {
          matches: next.map(function (m) { return { row: m.row, col: m.col, type: grid[m.row][m.col] }; }),
          progress: 0
        };
        eliminateParticles = spawnEliminateParticles(eliminateAnim.matches);
        if (comboIndex >= 1) {
          comboText = { text: 'COMBO x' + (comboIndex + 1), progress: 0 };
          screenShakeFrames = 2;
          screenShakeX = (Math.random() - 0.5) * 4;
          screenShakeY = (Math.random() - 0.5) * 4;
        }
        playSound(comboIndex >= 1 ? 'combo' : 'eliminate');
      } else {
        comboIndex = 0;
        state = 'idle';
        animating = false;
        lastTime = 0;
        if (allGoalsMet()) {
          var config = getLevelConfig(currentLevelId);
          var durationMs = (typeof Date.now === 'function' ? Date.now() : 0) - levelStartTime;
          var durationSec = Math.max(0, durationMs / 1000);
          var timeBonus = Math.max(0, Math.floor(600 - durationSec * 2));
          score += timeBonus;
          var th = config ? getStarThresholds(config) : { star2Score: 0, star3Score: 0 };
          var stars = 1;
          if (score >= th.star3Score) stars = 3; else if (score >= th.star2Score) stars = 2;
          lastEarnedStars = stars;
          if (saveData) {
            if (saveData.levelStuckCount) saveData.levelStuckCount[currentLevelId] = 0;
            var nextId = currentLevelId + 1;
            saveData.maxUnlockedLevel = Math.max(saveData.maxUnlockedLevel, nextId);
            var cur = saveData.stars[currentLevelId];
            saveData.stars[currentLevelId] = (cur == null ? stars : Math.max(cur, stars));
            var curBest = saveData.bestScorePerLevel[currentLevelId];
            saveData.bestScorePerLevel[currentLevelId] = (curBest == null ? score : Math.max(curBest, score));
            if (!saveData.gameRecords) saveData.gameRecords = [];
            var recordWin = {
              levelId: currentLevelId,
              durationSec: Math.round(durationSec * 100) / 100,
              movesUsed: initialMovesForLevel - movesLeft,
              totalMoves: initialMovesForLevel,
              score: score,
              stars: stars,
              elim3: elim3Count,
              elim4: elim4Count,
              elim5: elim5Count,
              elim6Plus: elim6PlusCount,
              win: true,
              timestamp: typeof Date.now === 'function' ? Date.now() : 0
            };
            saveData.gameRecords.push(recordWin);
            saveData.updatedAt = typeof Date.now === 'function' ? Date.now() : 0;
            saveSave(saveData);
            onLevelFinished(1, elim4Count + elim5Count + elim6PlusCount);
            setTimeout(showNextTaskCompletePopup, 300);
            persistProgressToCloud();
            if (currentUserId && typeof dataService !== 'undefined' && dataService.submitRecord) {
              dataService.submitRecord(currentUserId, recordWin, function () {});
            }
            submitScoreForRank(getTotalScoreForRank());
            rankDisplayScore = getTotalScoreForRank();
            lastMinipanelScoreSent = -1;
            if (currentUserId && typeof dataService !== 'undefined' && dataService.submitGlobalRank) {
              dataService.submitGlobalRank(currentUserId, getTotalScoreForRank(), function () {});
            }
          }
          overlay = 'win';
          playSound('win');
        } else if (movesLeft <= 0) {
          pendingFailRecord = true;
          overlay = 'fail';
          onLevelFinished(0, elim4Count + elim5Count + elim6PlusCount);
          saveSave(saveData);
          persistProgressToCloud();
          rankDisplayScore = getTotalScoreForRank();
          submitScoreForRank(getTotalScoreForRank());
          lastMinipanelScoreSent = -1;
          playSound('fail');
        }
        render();
        return;
      }
    }
  }

  if (eliminateParticles.length > 0) {
    for (var i = eliminateParticles.length - 1; i >= 0; i--) {
      var p = eliminateParticles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.life -= dt;
      p.vy += PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) eliminateParticles.splice(i, 1);
    }
  }
  if (comboText) {
    comboText.progress += dt / 0.7;
    if (comboText.progress >= 1) comboText = null;
  }
  if (screenShakeFrames > 0) screenShakeFrames--;
  for (var le = lineEffects.length - 1; le >= 0; le--) {
    lineEffects[le].progress += dt / DUR_LINE_FLAME;
    if (lineEffects[le].progress >= 1) lineEffects.splice(le, 1);
  }
  for (var be = bombEffects.length - 1; be >= 0; be--) {
    bombEffects[be].progress += dt / DUR_BOMB_FLAME;
    if (bombEffects[be].progress >= 1) bombEffects.splice(be, 1);
  }

  render();
  if (state !== 'idle' || lineEffects.length > 0 || bombEffects.length > 0) requestAnimationFrame(gameLoop);
  else animating = false;
}

/** 糖果风色块：圆角矩形、糖衣高光、双高光立体感，scaleX/scaleY 用于下落挤压。微信小游戏无 ellipse 时用 arc 兜底；任一步抛错则画简单色块。 */
function drawCandyGem(x, y, size, colorIndex, scale, opacity, scaleX, scaleY) {
  if (scale <= 0 || opacity <= 0) return;
  scaleX = scaleX != null ? scaleX : 1;
  scaleY = scaleY != null ? scaleY : 1;
  var pad = 2;
  var baseSize = size - pad * 2;
  var cx = x + baseSize / 2;
  var cy = y + baseSize / 2;
  var baseColor = COLORS[colorIndex];
  if (!baseColor) baseColor = '#888';

  ctx.save();
  try {
    ctx.globalAlpha = opacity;
    ctx.translate(cx, cy);
    ctx.scale(scale * scaleX, scale * scaleY);

    var half = baseSize / 2;
    var radius = Math.min(half - 1, 6);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(-half, -half, baseSize, baseSize, radius);
    } else {
      ctx.beginPath();
      var r = radius;
      ctx.moveTo(-half + r, -half);
      ctx.lineTo(half - r, -half);
      ctx.quadraticCurveTo(half, -half, half, -half + r);
      ctx.lineTo(half, half - r);
      ctx.quadraticCurveTo(half, half, half - r, half);
      ctx.lineTo(-half + r, half);
      ctx.quadraticCurveTo(-half, half, -half, half - r);
      ctx.lineTo(-half, -half + r);
      ctx.quadraticCurveTo(-half, -half, -half + r, -half);
    }
    var dark = shadeColor(baseColor, -0.25);
    var mid = shadeColor(baseColor, 0.08);
    var light = shadeColor(baseColor, 0.5);
    var grad = ctx.createRadialGradient(-half * 0.4, -half * 0.4, 0, 0, 0, half * 1.4);
    grad.addColorStop(0, light);
    grad.addColorStop(0.35, baseColor);
    grad.addColorStop(0.7, mid);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(-half * 0.4, -half * 0.4, half * 0.32, half * 0.2, -0.4, 0, Math.PI * 2);
    } else {
      ctx.arc(-half * 0.4, -half * 0.4, half * 0.2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(half * 0.25, half * 0.3, half * 0.15, half * 0.08, 0.3, 0, Math.PI * 2);
    } else {
      ctx.arc(half * 0.25, half * 0.3, half * 0.08, 0, Math.PI * 2);
    }
    ctx.fill();
  } catch (e) {
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

/** 卡通风格方格：圆角色块 + 边框 + 高光块 */
function drawSimpleGem(x, y, size, colorIndex, scale, opacity) {
  if (scale <= 0 || opacity <= 0) return;
  var base = COLORS[colorIndex] || '#888';
  var dark = shadeColor(base, -0.2);
  var light = shadeColor(base, 0.35);
  var r = Math.max(2, Math.min(size / 5, 8));
  ctx.save();
  ctx.globalAlpha = opacity;
  roundRectPath(ctx, x, y, size, size, r);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x + 2, y + 2, Math.max(2, size * 0.38), Math.max(2, size * 0.32));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + size * 0.52, y + size * 0.48, Math.max(1, size * 0.18), Math.max(1, size * 0.14));
  roundRectPath(ctx, x, y, size, size, r);
  ctx.strokeStyle = light;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 使用 images/gem_N.png 绘制宝石；未加载或失败时回退为带高光的 drawSimpleGem */
function drawGemImage(x, y, size, colorIndex, scale, opacity) {
  if (scale <= 0 || opacity <= 0) return;
  var img = GEM_IMAGES[colorIndex];
  var ready = img && (img.width > 0 || img.naturalWidth > 0 || img.complete);
  if (ready) {
    try {
      ctx.save();
      ctx.globalAlpha = opacity;
      if (scale !== 1) {
        var s = size * scale;
        var ox = (size - s) * 0.5;
        ctx.drawImage(img, x + ox, y + ox, s, s);
      } else {
        ctx.drawImage(img, x, y, size, size);
      }
      ctx.restore();
    } catch (e) {
      drawSimpleGem(x, y, size, colorIndex, scale, opacity);
    }
  } else {
    drawSimpleGem(x, y, size, colorIndex, scale, opacity);
  }
}

function drawBubbleGem(x, y, size, colorIndex, scale, opacity, scaleX, scaleY) {
  if (USE_SIMPLE_GRID) {
    drawGemImage(x, y, size, colorIndex, scale, opacity);
    return;
  }
  if (typeof wx !== 'undefined') {
    drawCandyGemWx(x, y, size, colorIndex, scale, opacity, scaleX, scaleY);
    return;
  }
  drawCandyGem(x, y, size, colorIndex, scale, opacity, scaleX, scaleY);
}

/** 微信小游戏可用的宝石绘制：仅用 arc、手动圆角路径、径向渐变，不用 ellipse/roundRect */
function drawCandyGemWx(x, y, size, colorIndex, scale, opacity, scaleX, scaleY) {
  if (scale <= 0 || opacity <= 0) return;
  scaleX = scaleX != null ? scaleX : 1;
  scaleY = scaleY != null ? scaleY : 1;
  var pad = 2;
  var baseSize = size - pad * 2;
  var cx = x + baseSize / 2;
  var cy = y + baseSize / 2;
  var baseColor = COLORS[colorIndex] || '#888';
  var half = baseSize / 2;
  var radius = Math.min(half - 1, 6);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(cx, cy);
  ctx.scale(scale * scaleX, scale * scaleY);

  ctx.beginPath();
  ctx.moveTo(-half + radius, -half);
  ctx.lineTo(half - radius, -half);
  ctx.quadraticCurveTo(half, -half, half, -half + radius);
  ctx.lineTo(half, half - radius);
  ctx.quadraticCurveTo(half, half, half - radius, half);
  ctx.lineTo(-half + radius, half);
  ctx.quadraticCurveTo(-half, half, -half, half - radius);
  ctx.lineTo(-half, -half + radius);
  ctx.quadraticCurveTo(-half, -half, -half + radius, -half);
  ctx.closePath();
  var dark = shadeColor(baseColor, -0.25);
  var mid = shadeColor(baseColor, 0.08);
  var light = shadeColor(baseColor, 0.5);
  var grad = ctx.createRadialGradient(-half * 0.4, -half * 0.4, 0, 0, 0, half * 1.4);
  grad.addColorStop(0, light);
  grad.addColorStop(0.35, baseColor);
  grad.addColorStop(0.7, mid);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-half * 0.4, -half * 0.4, half * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(half * 0.25, half * 0.3, half * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** 特殊块卡通绘制：圆角 + 边框 + 高光 */
function drawSimpleSpecialBlock(x, y, size, specialType) {
  var half = size / 2;
  var cx = x + half;
  var cy = y + half;
  var r = Math.max(2, Math.min(size / 5, 8));
  ctx.save();
  if (specialType === LINE_H || specialType === LINE_V) {
    roundRectPath(ctx, x, y, size, size, r);
    ctx.fillStyle = '#fffef5';
    ctx.fill();
    ctx.strokeStyle = '#e6b800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd93d';
    if (specialType === LINE_H) {
      ctx.fillRect(x + 2, cy - 4, size - 4, 8);
    } else {
      ctx.fillRect(cx - 4, y + 2, 8, size - 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x + 2, y + 2, size * 0.35, size * 0.28);
    roundRectPath(ctx, x, y, size, size, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (specialType === BOMB) {
    roundRectPath(ctx, x, y, size, size, r);
    ctx.fillStyle = '#ff9800';
    ctx.fill();
    ctx.strokeStyle = '#c66900';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + 2, y + 2, size * 0.35, size * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (half * 1.2) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy);
    roundRectPath(ctx, x, y, size, size, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** 特殊块绘制：直线消除器（横/竖条纹）、炸弹（圆形+星） */
function drawSpecialBlock(x, y, size, specialType) {
  if (USE_SIMPLE_GRID) {
    drawSimpleSpecialBlock(x, y, size, specialType);
    return;
  }
  var half = size / 2;
  var cx = x + half;
  var cy = y + half;
  ctx.save();
  if (specialType === LINE_H || specialType === LINE_V) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    if (ctx.roundRect) ctx.roundRect(x, y, size, size, 4);
    else ctx.fillRect(x, y, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1c40f';
    if (specialType === LINE_H) {
      ctx.fillRect(x, cy - 3, size, 6);
    } else {
      ctx.fillRect(cx - 3, y, 6, size);
    }
  } else if (specialType === BOMB) {
    var g = ctx.createRadialGradient(cx - 8, cy - 8, 0, cx, cy, half);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.4, '#ff9800');
    g.addColorStop(1, '#e65100');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, half - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (half * 1.2) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy);
  }
  ctx.restore();
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + (num >> 16) * percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + ((num >> 8) & 0x00FF) * percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + (num & 0x0000FF) * percent));
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** 圆角矩形路径（仅 path，兼容无 roundRect 的环境），r 为圆角半径 */
function roundRectPath(ctx, x, y, w, h, r) {
  if (r <= 0 || r >= w / 2 || r >= h / 2) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** 下落位置缓动：ease-out quad */
function easeOutDrop(t) {
  return 1 - (1 - t) * (1 - t);
}

/** 交换缓动：ease-out-back，略过冲再回弹 */
function easeOutBack(t) {
  var c1 = 1.7;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 填充入场：ease-out-back，小幅 overshoot */
function easeOutBackFill(t) {
  var c1 = 2.2;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 下落落地时的果冻变形：挤压幅度略大、略提前 */
function getDropSquash(p) {
  if (p < 0.7) return { scaleX: 1, scaleY: 1 };
  var land = (p - 0.7) / 0.3;
  var squash = Math.sin(land * Math.PI);
  return { scaleX: 1 + squash * 0.24, scaleY: 1 - squash * 0.4 };
}

/** 消除时生成飞散粒子：更多、更随机、带重力与生命周期 */
const PARTICLE_GRAVITY = 100;
function spawnEliminateParticles(matches) {
  var list = [];
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var cx = offsetX + (m.col + 0.5) * cellSize;
    var cy = offsetY + (m.row + 0.5) * cellSize;
    var colorIndex = m.type >= 0 && m.type < GEM_TYPES ? m.type : 0;
    var count = 8 + Math.floor(Math.random() * 5);
    for (var k = 0; k < count; k++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 80 + Math.random() * 100;
      list.push({
        x: cx, y: cy, prevX: cx, prevY: cy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.55, maxLife: 0.55, colorIndex: colorIndex
      });
    }
  }
  return list;
}

/** 消除「爆开」缩放：前段更猛放大，后段快速缩小 */
function getEliminateScale(p) {
  if (p <= 0.2) return 1 + (p / 0.2) * 0.35;
  if (p >= 0.9) return 0;
  return 1.35 - (p - 0.2) / 0.7 * 1.35;
}

// 阶段五：关卡选择地图（无限关卡，每页 20 关，分页）
var MAP_TOP = 50;
var MAP_COLS = 5;
var MAP_ROWS = 4;
var LEVELS_PER_PAGE = MAP_COLS * MAP_ROWS; // 20
var MAP_BOTTOM = 88;
var levelMapPage = 0; // 当前页码，0 起
var btnMapPrevRect = null;
var btnMapNextRect = null;
function getMapTouchLevel(clientX, clientY) {
  var cellW = contentWidth / MAP_COLS;
  var cellH = (contentHeight - MAP_TOP - MAP_BOTTOM) / MAP_ROWS;
  if (clientY < contentY + MAP_TOP) return null;
  var row = Math.floor((clientY - contentY - MAP_TOP) / cellH);
  var col = Math.floor((clientX - contentX) / cellW);
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return null;
  return levelMapPage * LEVELS_PER_PAGE + row * MAP_COLS + col + 1;
}
function ensureLevelMapPageInRange() {
  if (levelMapPage < 0) levelMapPage = 0;
}

var btnRankRect = null; // 排行榜按钮（开局界面或原地图）
var btnRankCloseRect = null; // 排行榜关闭按钮
var btnTaskRect = null;
var btnTaskCloseRect = null;
var btnShareRect = null;
var taskClaimRects = []; // { taskId, x, y, w, h }
var RANK_PANEL_W = 300;
var RANK_PANEL_H = 380;
var rankTab = 'friend'; // 'friend' | 'global'
var friendRankType = 'score'; // 'score' | 'level' | 'stars'，好友排行子类型
var globalRankList = [];
var globalRankLoading = false;
var btnRankFriendRect = null;
var btnRankGlobalRect = null;
var btnRankScoreRect = null;
var btnRankLevelRect = null;
var btnRankStarsRect = null;

var btnStartContinueRect = null;
var btnBackToMainRect = null;

function renderStart() {
  var w = canvas.width;
  var h = canvas.height;
  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);
  }
  var staminaCur = getCurrentStamina();
  var goldVal = saveData && typeof saveData.gold === 'number' ? saveData.gold : 0;
  ctx.fillStyle = '#ffd93d';
  ctx.font = '14px ' + FONT_FAMILY;
  ctx.textAlign = 'left';
  ctx.fillText('金币 ' + goldVal, contentX + 12, contentY + 24);
  ctx.fillText('体力 ' + staminaCur + '/' + STAMINA_MAX, contentX + contentWidth - 80, contentY + 24);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eee';
  ctx.font = '22px ' + FONT_FAMILY;
  ctx.fillText('萌兽三消', contentX + contentWidth / 2, contentY + 50);
  ctx.font = '16px ' + FONT_FAMILY;
  ctx.fillText('请选择开始方式', contentX + contentWidth / 2, contentY + 90);
  if (staminaCur < 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillText('体力不足可用' + STAMINA_GOLD_COST + '金币购买1点体力', contentX + contentWidth / 2, contentY + 108);
  }
  var btnW = Math.min(220, contentWidth - 40);
  var btnH = 44;
  var cx = contentX + contentWidth / 2;
  var y1 = contentY + 130;
  var y2 = contentY + 130 + btnH + 16;
  ctx.fillStyle = '#4a7c59';
  ctx.fillRect(cx - btnW / 2, y1, btnW, btnH);
  ctx.strokeStyle = '#4a7c9e';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - btnW / 2, y1, btnW, btnH);
  ctx.fillStyle = '#fff';
  ctx.font = '16px ' + FONT_FAMILY;
  ctx.fillText('从上次关卡继续', cx, y1 + btnH / 2 + 5);
  btnStartContinueRect = { x: cx - btnW / 2, y: y1, w: btnW, h: btnH };
  var rankBtnW = 120;
  var rankBtnH = 32;
  var y3 = y1 + btnH + 16;
  ctx.fillStyle = '#6b4a7c';
  ctx.fillRect(cx - rankBtnW / 2, y3, rankBtnW, rankBtnH);
  ctx.strokeStyle = '#eee';
  ctx.strokeRect(cx - rankBtnW / 2, y3, rankBtnW, rankBtnH);
  ctx.fillStyle = '#fff';
  ctx.font = '15px ' + FONT_FAMILY;
  ctx.fillText('排行榜', cx, y3 + rankBtnH / 2 + 5);
  btnRankRect = { x: cx - rankBtnW / 2, y: y3, w: rankBtnW, h: rankBtnH };
  var y4 = y3 + rankBtnH + 12;
  ctx.fillStyle = '#4a6b2a';
  ctx.fillRect(cx - rankBtnW / 2, y4, rankBtnW, rankBtnH);
  ctx.strokeRect(cx - rankBtnW / 2, y4, rankBtnW, rankBtnH);
  ctx.fillStyle = '#fff';
  ctx.fillText('任务', cx, y4 + rankBtnH / 2 + 5);
  btnTaskRect = { x: cx - rankBtnW / 2, y: y4, w: rankBtnW, h: rankBtnH };
  var y5 = y4 + rankBtnH + 12;
  ctx.fillStyle = '#7c6b4a';
  ctx.fillRect(cx - rankBtnW / 2, y5, rankBtnW, rankBtnH);
  ctx.strokeRect(cx - rankBtnW / 2, y5, rankBtnW, rankBtnH);
  ctx.fillStyle = '#fff';
  ctx.fillText('分享', cx, y5 + rankBtnH / 2 + 5);
  btnShareRect = { x: cx - rankBtnW / 2, y: y5, w: rankBtnW, h: rankBtnH };
}

function renderMap() {
  ensureLevelMapPageInRange();
  var w = canvas.width;
  var h = canvas.height;
  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);
  }
  var cellW = contentWidth / MAP_COLS;
  var cellH = (contentHeight - MAP_TOP - MAP_BOTTOM) / MAP_ROWS;
  ctx.fillStyle = '#eee';
  ctx.font = '18px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  var maxUnlocked = saveData ? saveData.maxUnlockedLevel : 1;
  var pageStart = levelMapPage * LEVELS_PER_PAGE + 1;
  ctx.fillText('选择关卡（' + pageStart + '-' + (pageStart + LEVELS_PER_PAGE - 1) + '）', contentX + contentWidth / 2, contentY + 28);
  for (var row = 0; row < MAP_ROWS; row++) {
    for (var col = 0; col < MAP_COLS; col++) {
      var levelId = levelMapPage * LEVELS_PER_PAGE + row * MAP_COLS + col + 1;
      var x = contentX + col * cellW + 4;
      var y = contentY + MAP_TOP + row * cellH + 4;
      var boxW = cellW - 8;
      var boxH = cellH - 8;
      var locked = levelId > maxUnlocked;
      ctx.fillStyle = locked ? '#3d3d5c' : '#2a4a7c';
      ctx.fillRect(x, y, boxW, boxH);
      ctx.strokeStyle = locked ? '#5c5c8a' : '#4a7c9e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, boxW, boxH);
      ctx.fillStyle = '#fff';
      ctx.font = '14px ' + FONT_FAMILY;
      ctx.fillText('' + levelId, x + boxW / 2, y + boxH / 2 - 6);
      var stars = saveData && saveData.stars[levelId] != null ? saveData.stars[levelId] : 0;
      ctx.font = '11px ' + FONT_FAMILY;
      ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), x + boxW / 2, y + boxH / 2 + 8);
      if (locked) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, boxW, boxH);
      }
    }
  }
  var barY = contentY + contentHeight - MAP_BOTTOM;
  var btnH = 28;
  var btnW = 56;
  var prevX = contentX + contentWidth / 2 - btnW - 8;
  var nextX = contentX + contentWidth / 2 + 8;
  ctx.fillStyle = levelMapPage > 0 ? '#4a7c59' : '#3d3d5c';
  ctx.fillRect(prevX, barY + 6, btnW, btnH);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(prevX, barY + 6, btnW, btnH);
  ctx.fillStyle = '#fff';
  ctx.font = '14px ' + FONT_FAMILY;
  ctx.fillText('上一页', prevX + btnW / 2, barY + 6 + btnH / 2 + 4);
  btnMapPrevRect = levelMapPage > 0 ? { x: prevX, y: barY + 6, w: btnW, h: btnH } : null;
  ctx.fillStyle = '#4a7c59';
  ctx.fillRect(nextX, barY + 6, btnW, btnH);
  ctx.strokeRect(nextX, barY + 6, btnW, btnH);
  ctx.fillText('下一页', nextX + btnW / 2, barY + 6 + btnH / 2 + 4);
  btnMapNextRect = { x: nextX, y: barY + 6, w: btnW, h: btnH };
  var rankBtnW = 120;
  var rankBtnH = 32;
  var rankBtnX = contentX + (contentWidth - rankBtnW) / 2;
  var rankBtnY = barY + 6 + btnH + 6;
  ctx.fillStyle = '#4a7c59';
  ctx.fillRect(rankBtnX, rankBtnY, rankBtnW, rankBtnH);
  ctx.strokeStyle = '#eee';
  ctx.strokeRect(rankBtnX, rankBtnY, rankBtnW, rankBtnH);
  ctx.fillStyle = '#fff';
  ctx.font = '15px ' + FONT_FAMILY;
  ctx.fillText('排行榜', contentX + contentWidth / 2, rankBtnY + rankBtnH / 2 + 5);
  btnRankRect = { x: rankBtnX, y: rankBtnY, w: rankBtnW, h: rankBtnH };
}

function openRankPanel() {
  gameScene = 'rank';
  rankTab = 'friend';
  friendRankType = 'score';
  try {
    var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
    if (openCtx && openCtx.canvas) {
      openCtx.canvas.width = RANK_PANEL_W;
      openCtx.canvas.height = RANK_PANEL_H;
      openCtx.postMessage({ type: 'refresh', rankType: 'score' });
    }
  } catch (e) {}
  rankLoop();
}

function renderRank() {
  var w = canvas.width;
  var h = canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, w, h);
  var panelX = contentX + (contentWidth - RANK_PANEL_W) / 2;
  var panelY = contentY + (contentHeight - RANK_PANEL_H - 50) / 2;
  if (panelY < contentY + 8) panelY = contentY + 8;
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(panelX, panelY, RANK_PANEL_W, RANK_PANEL_H);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, RANK_PANEL_W, RANK_PANEL_H);
  var tabH = 36;
  var tabY = panelY + 4;
  var tabW = (RANK_PANEL_W - 12) / 2;
  ctx.fillStyle = rankTab === 'friend' ? '#4a7c59' : '#3d3d5c';
  ctx.fillRect(panelX + 4, tabY, tabW, tabH - 4);
  ctx.fillStyle = '#fff';
  ctx.font = '14px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.fillText('好友排行', panelX + 4 + tabW / 2, tabY + (tabH - 4) / 2 + 5);
  btnRankFriendRect = { x: panelX + 4, y: tabY, w: tabW, h: tabH - 4 };
  ctx.fillStyle = rankTab === 'global' ? '#4a7c59' : '#3d3d5c';
  ctx.fillRect(panelX + 8 + tabW, tabY, tabW, tabH - 4);
  ctx.fillStyle = '#fff';
  ctx.fillText('全球排行', panelX + 8 + tabW + tabW / 2, tabY + (tabH - 4) / 2 + 5);
  btnRankGlobalRect = { x: panelX + 8 + tabW, y: tabY, w: tabW, h: tabH - 4 };
  var contentTop = panelY + tabH + 4;
  var contentH = RANK_PANEL_H - tabH - 12;
  if (rankTab === 'friend') {
    var subTabH = 28;
    var subTabW = (RANK_PANEL_W - 16) / 3;
    var subY = contentTop;
    contentTop = subY + subTabH + 4;
    contentH -= subTabH + 4;
    ctx.fillStyle = friendRankType === 'score' ? '#4a7c59' : '#3d3d5c';
    ctx.fillRect(panelX + 4, subY, subTabW, subTabH);
    ctx.fillStyle = '#fff';
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillText('积分', panelX + 4 + subTabW / 2, subY + subTabH / 2 + 4);
    btnRankScoreRect = { x: panelX + 4, y: subY, w: subTabW, h: subTabH };
    ctx.fillStyle = friendRankType === 'level' ? '#4a7c59' : '#3d3d5c';
    ctx.fillRect(panelX + 6 + subTabW, subY, subTabW, subTabH);
    ctx.fillStyle = '#fff';
    ctx.fillText('关卡', panelX + 6 + subTabW + subTabW / 2, subY + subTabH / 2 + 4);
    btnRankLevelRect = { x: panelX + 6 + subTabW, y: subY, w: subTabW, h: subTabH };
    ctx.fillStyle = friendRankType === 'stars' ? '#4a7c59' : '#3d3d5c';
    ctx.fillRect(panelX + 8 + subTabW * 2, subY, subTabW, subTabH);
    ctx.fillStyle = '#fff';
    ctx.fillText('星级', panelX + 8 + subTabW * 2 + subTabW / 2, subY + subTabH / 2 + 4);
    btnRankStarsRect = { x: panelX + 8 + subTabW * 2, y: subY, w: subTabW, h: subTabH };
    try {
      var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
      if (openCtx && openCtx.canvas) {
        ctx.drawImage(openCtx.canvas, 0, 0, openCtx.canvas.width || RANK_PANEL_W, openCtx.canvas.height || RANK_PANEL_H, panelX, contentTop, RANK_PANEL_W, contentH);
      }
    } catch (e) {}
  } else {
    btnRankScoreRect = null;
    btnRankLevelRect = null;
    btnRankStarsRect = null;
    ctx.fillStyle = '#16213e';
    ctx.fillRect(panelX + 4, contentTop, RANK_PANEL_W - 8, contentH);
    if (globalRankLoading) {
      ctx.fillStyle = '#eee';
      ctx.font = '14px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText('加载中…', panelX + RANK_PANEL_W / 2, contentTop + contentH / 2 - 8);
    } else if (globalRankList.length === 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = '14px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText('暂无全球排行数据', panelX + RANK_PANEL_W / 2, contentTop + contentH / 2 - 8);
    } else {
      var lineH = 28;
      var left = panelX + 12;
      var right = panelX + RANK_PANEL_W - 12;
      for (var i = 0; i < globalRankList.length && (contentTop + 20 + (i + 1) * lineH) <= panelY + RANK_PANEL_H - 8; i++) {
        var item = globalRankList[i];
        var y = contentTop + 16 + i * lineH;
        ctx.fillStyle = '#fff';
        ctx.font = '13px ' + FONT_FAMILY;
        ctx.textAlign = 'left';
        ctx.fillText('第' + (item.rank || (i + 1)) + '名', left, y + 16);
        ctx.textAlign = 'right';
        ctx.fillText(String(item.totalScore != null ? item.totalScore : 0), right, y + 16);
      }
    }
  }
  var closeW = 100;
  var closeH = 36;
  var closeX = contentX + (contentWidth - closeW) / 2;
  var closeY = panelY + RANK_PANEL_H + 8;
  ctx.fillStyle = '#5c5c8a';
  ctx.fillRect(closeX, closeY, closeW, closeH);
  ctx.fillStyle = '#fff';
  ctx.font = '16px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.fillText('关闭', contentX + contentWidth / 2, closeY + closeH / 2 + 6);
  btnRankCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH };
}

function rankLoop() {
  if (gameScene !== 'rank') return;
  renderRank();
  requestAnimationFrame(rankLoop);
}

function renderTasks() {
  taskClaimRects = [];
  var w = canvas.width;
  var h = canvas.height;
  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = '#eee';
  ctx.font = '20px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.fillText('任务', contentX + contentWidth / 2, contentY + 28);
  var left = contentX + 12;
  var rowH = 56;
  var y = contentY + 44;
  var now = typeof Date.now === 'function' ? Date.now() : 0;

  function drawTaskList(list, title) {
    ctx.fillStyle = '#aaa';
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.fillText(title, left, y);
    y += 22;
    for (var i = 0; i < list.length; i++) {
      var task = list[i];
      var tid = task.id;
      var prog = saveData && saveData.taskProgress ? saveData.taskProgress[tid] : null;
      if (!prog) prog = { status: 'locked', progress: 0 };
      if (prog.status === 'unlocked' && !prog.firstViewedAt) {
        saveData.taskProgress[tid] = saveData.taskProgress[tid] || {};
        saveData.taskProgress[tid].firstViewedAt = now;
        recordTaskEvent(tid, 'first_view', {});
      }
      var target = (task.objective && task.objective.target) || 1;
      var progressVal = prog.progress || 0;
      var statusText = prog.status === 'locked' ? '未解锁' : prog.status === 'unlocked' ? '进行中' : prog.status === 'completed' ? '可领取' : '已领取';
      ctx.fillStyle = prog.status === 'locked' ? '#666' : '#eee';
      ctx.font = '14px ' + FONT_FAMILY;
      ctx.fillText(task.name + ' ' + progressVal + '/' + target + ' ' + statusText, left, y + 14);
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.fillStyle = '#aaa';
      ctx.fillText(task.desc + '  奖励: ' + (task.rewardGold || 0) + '金' + ((task.rewardStamina || 0) > 0 ? ' +' + task.rewardStamina + '体力' : ''), left, y + 30);
      if (prog.status === 'completed') {
        var claimW = 56;
        var claimH = 28;
        var claimX = contentX + contentWidth - 12 - claimW;
        var claimY = y + 4;
        ctx.fillStyle = '#4a7c59';
        ctx.fillRect(claimX, claimY, claimW, claimH);
        ctx.fillStyle = '#fff';
        ctx.font = '13px ' + FONT_FAMILY;
        ctx.textAlign = 'center';
        ctx.fillText('领取', claimX + claimW / 2, claimY + claimH / 2 + 5);
        ctx.textAlign = 'left';
        taskClaimRects.push({ taskId: tid, x: claimX, y: claimY, w: claimW, h: claimH });
      }
      y += rowH;
    }
    y += 12;
  }

  var dailyTasks = TASK_CONFIG.filter(function (t) { return t.type === 'daily'; });
  var weeklyTasks = TASK_CONFIG.filter(function (t) { return t.type === 'weekly'; });
  drawTaskList(dailyTasks, '每日任务');
  drawTaskList(weeklyTasks, '每周任务');

  var closeW = 100;
  var closeH = 36;
  var closeX = contentX + (contentWidth - closeW) / 2;
  var closeY = contentY + contentHeight - closeH - 24;
  ctx.fillStyle = '#5c5c8a';
  ctx.fillRect(closeX, closeY, closeW, closeH);
  ctx.fillStyle = '#fff';
  ctx.font = '16px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.fillText('返回', contentX + contentWidth / 2, closeY + closeH / 2 + 6);
  btnTaskCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH };
}

function tasksLoop() {
  if (gameScene !== 'tasks') return;
  renderTasks();
  requestAnimationFrame(tasksLoop);
}

function render() {
  updateLayout();
  var w = canvas.width;
  var h = canvas.height;
  if (!w || w <= 0 || !h || h <= 0) {
    try {
      var sys = wx.getSystemInfoSync();
      w = sys.windowWidth || 375;
      h = sys.windowHeight || 375;
    } catch (e) {}
    w = w || 375;
    h = h || 375;
  }
  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);
  }
  if (!grid || grid.length === 0 || cellSize <= 0) return;
  if (screenShakeFrames > 0) {
    ctx.save();
    ctx.translate(screenShakeX, screenShakeY);
  }

  var hudLeft = contentX + Math.max(4, safeInsetLeft);
  var hudY = contentY + Math.max(14, safeInsetTop + 8);
  var lineH = 16;
  ctx.fillStyle = '#eee';
  ctx.font = '13px ' + FONT_FAMILY;
  ctx.textAlign = 'left';
  ctx.fillText('关卡 ' + (currentLevelId || 1), hudLeft, hudY);
  ctx.fillText('步数: ' + movesLeft, hudLeft, hudY + lineH);
  if (saveData && typeof saveData.gold === 'number') {
    ctx.fillText('金币: ' + saveData.gold, hudLeft, hudY + lineH * 2);
  }
  var goalOffset = (saveData && typeof saveData.gold === 'number') ? 3 : 2;
  for (var i = 0; i < currentGoals.length; i++) {
    var goal = currentGoals[i];
    var y = hudY + (i + goalOffset) * lineH;
    if (goal.type === 'score') {
      ctx.fillStyle = '#eee';
      ctx.fillText('分数: ' + score + ' / ' + goal.value, hudLeft, y);
    } else if (goal.type === 'collect') {
      var prog = goalProgress['collect_' + goal.color] || 0;
      var name = COLOR_NAMES[goal.color] != null ? COLOR_NAMES[goal.color] : ('色' + goal.color);
      ctx.fillStyle = COLORS[goal.color] || '#eee';
      ctx.fillText(name + ': ' + prog + ' / ' + goal.amount, hudLeft, y);
    }
  }
  if (gameScene === 'play' && saveData && saveData.taskProgress) {
    var taskParts = [];
    for (var ti = 0; ti < TASK_CONFIG.length; ti++) {
      var t = TASK_CONFIG[ti];
      var prog = saveData.taskProgress[t.id] || {};
      if (prog.status === 'locked' || prog.status === 'claimed') continue;
      var target = (t.objective && t.objective.target) || 1;
      var p = prog.progress || 0;
      taskParts.push(t.name + ' ' + p + '/' + target);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px ' + FONT_FAMILY;
    ctx.fillText(taskParts.length ? taskParts.join('  ') : '任务', hudLeft, hudY + (currentGoals.length + goalOffset) * lineH);
    var fourCount = elim4Count + elim5Count + elim6PlusCount;
    var today = getDateKey();
    var fourClaimedToday = (saveData.fourMatchGoldClaimedDate === today) ? (saveData.fourMatchGoldClaimedToday || 0) : 0;
    if (fourClaimedToday >= 5) {
      ctx.fillText('今日四连50金已领满', hudLeft, hudY + (currentGoals.length + goalOffset + 1) * lineH);
    } else {
      var fourGoldByRule = Math.floor(fourCount / 5) * 50;
      var fourLine1 = '本局四连: ' + fourCount + '  每5次四连奖50金(今日已领' + fourClaimedToday + '/5)';
      var fourLine2 = '本局四连可得金币: ' + fourGoldByRule;
      ctx.fillText(fourLine1, hudLeft, hudY + (currentGoals.length + goalOffset + 1) * lineH);
      ctx.fillText(fourLine2, hudLeft, hudY + (currentGoals.length + goalOffset + 2) * lineH);
    }
  }
  ctx.fillStyle = '#eee';
  var potentialTotal = (gameScene === 'play') ? rankDisplayScore : getPotentialTotalScoreForRank();
  var rankPanelX = contentX + contentWidth - MINIPANEL_W - Math.max(RANK_PANEL_RIGHT_MARGIN, safeInsetRight + 16);
  var rankPanelY = contentY + Math.max(8, safeInsetTop + 4);
  var rankPanelTotalH = MINIPANEL_H + RANK_PANEL_EXTRA;
  if (gameScene === 'play') {
    var staminaCurPlay = getCurrentStamina();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.textAlign = 'right';
    ctx.fillText('体力 ' + staminaCurPlay + '/' + STAMINA_MAX, rankPanelX + MINIPANEL_W, rankPanelY - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(22,33,62,0.92)';
    ctx.fillRect(rankPanelX, rankPanelY, MINIPANEL_W, rankPanelTotalH);
    ctx.strokeStyle = '#4a7c9e';
    ctx.lineWidth = 2;
    ctx.strokeRect(rankPanelX, rankPanelY, MINIPANEL_W, rankPanelTotalH);
    ctx.fillStyle = '#fff';
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.fillText('好友排名', rankPanelX + 10, rankPanelY + 20);
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('加载中，真机显示排名', rankPanelX + 10, rankPanelY + 40);
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('总得分: ' + Math.floor(potentialTotal), rankPanelX + 10, rankPanelY + MINIPANEL_H + 16);
  }
  try {
    var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
    if (gameScene === 'play' && openCtx && openCtx.canvas) {
      if (openCtx.canvas.width !== MINIPANEL_W || openCtx.canvas.height !== MINIPANEL_H) {
        openCtx.canvas.width = MINIPANEL_W;
        openCtx.canvas.height = MINIPANEL_H;
        openCtx.postMessage({ type: 'minipanel', score: Math.floor(potentialTotal) });
      }
      updateRankMinipanel(potentialTotal);
      ctx.drawImage(openCtx.canvas, 0, 0, MINIPANEL_W, MINIPANEL_H, rankPanelX, rankPanelY, MINIPANEL_W, MINIPANEL_H);
    } else {
      updateRankMinipanel(potentialTotal);
      if (openCtx && openCtx.canvas && openCtx.canvas.width === MINIPANEL_W) {
        ctx.drawImage(openCtx.canvas, 0, 0, MINIPANEL_W, MINIPANEL_H, rankPanelX, rankPanelY, MINIPANEL_W, MINIPANEL_H);
      }
    }
  } catch (e) {}

  const pad = 2;
  ctx.globalAlpha = 1;

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
        const scale = getEliminateScale(p);
        const opacity = p > 0.6 ? Math.max(0, (1 - p) / 0.4) : 1;
        const cell = elimTypes.get(key);
        if (cell >= 0) drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, cell, scale, opacity);
        continue;
      }
      if (isDropTarget && dropAnims.length > 0) {
      } else if (grid[r][c] >= 0 && grid[r][c] < GEM_TYPES && !isFilling) {
        try {
          drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, grid[r][c], 1, 1);
        } catch (e) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = COLORS[grid[r][c]] || '#888';
          ctx.fillRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          ctx.restore();
        }
        if (iceGrid[r] && iceGrid[r][c] > 0) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = 'rgba(200,230,255,0.7)';
          var box = cellSize - pad * 2;
          var cr = Math.max(2, Math.min(box / 5, 6));
          roundRectPath(ctx, x + pad, y + pad, box, box, cr);
          ctx.fill();
          ctx.restore();
        }
      } else if ((grid[r][c] === LINE_H || grid[r][c] === LINE_V || grid[r][c] === BOMB) && !isFilling) {
        drawSpecialBlock(x + pad, y + pad, cellSize - pad * 2, grid[r][c]);
      }
    }
  }

  if (gameScene === 'play') {
    var backBtnW = 120;
    var backBtnH = 36;
    var backX = contentX + (contentWidth - backBtnW) / 2;
    var backY = contentY + contentHeight - backBtnH - 20;
    ctx.fillStyle = 'rgba(92,92,138,0.9)';
    ctx.fillRect(backX, backY, backBtnW, backBtnH);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(backX, backY, backBtnW, backBtnH);
    ctx.fillStyle = '#fff';
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText('返回主菜单', backX + backBtnW / 2, backY + backBtnH / 2 + 5);
    ctx.textAlign = 'left';
    btnBackToMainRect = { x: backX, y: backY, w: backBtnW, h: backBtnH };
  } else {
    btnBackToMainRect = null;
  }

  if (eliminateAnim && eliminateAnim.progress < 0.4 && eliminateAnim.matches.length > 0) {
    var ax = 0, ay = 0;
    for (var i = 0; i < eliminateAnim.matches.length; i++) {
      var m = eliminateAnim.matches[i];
      ax += offsetX + (m.col + 0.5) * cellSize;
      ay += offsetY + (m.row + 0.5) * cellSize;
    }
    ax /= eliminateAnim.matches.length;
    ay /= eliminateAnim.matches.length;
    var flashP = eliminateAnim.progress / 0.4;
    var flashAlpha = (1 - flashP) * 0.22;
    var flashR = 50 + flashP * 30;
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    var g = ctx.createRadialGradient(ax, ay, 0, ax, ay, flashR);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ax - flashR, ay - flashR, flashR * 2, flashR * 2);
    ctx.restore();
    var firstType = eliminateAnim.matches[0].type;
    if (firstType >= 0 && firstType < GEM_TYPES) {
      var mainColor = COLORS[firstType];
      var r = parseInt(mainColor.slice(1, 3), 16);
      var gb = parseInt(mainColor.slice(3, 5), 16);
      var bb = parseInt(mainColor.slice(5, 7), 16);
      var colorFlash = 'rgba(' + r + ',' + gb + ',' + bb + ',' + (0.2 * (1 - flashP)) + ')';
      ctx.save();
      ctx.globalAlpha = 1;
      var g2 = ctx.createRadialGradient(ax, ay, 0, ax, ay, flashR * 0.8);
      g2.addColorStop(0, colorFlash);
      g2.addColorStop(0.6, 'rgba(255,255,255,0)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(ax - flashR, ay - flashR, flashR * 2, flashR * 2);
      ctx.restore();
    }
    for (var si = 0; si < eliminateAnim.matches.length; si++) {
      var sm = eliminateAnim.matches[si];
      var delay = (sm.row + sm.col) * 0.04;
      var localP = (eliminateAnim.progress - delay) / 0.2;
      if (localP >= 0 && localP < 1) {
        var sx = offsetX + (sm.col + 0.5) * cellSize;
        var sy = offsetY + (sm.row + 0.5) * cellSize;
        var sR = 18 + localP * 12;
        var sAlpha = (1 - localP) * 0.25;
        ctx.save();
        ctx.globalAlpha = sAlpha;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sR);
        sg.addColorStop(0, 'rgba(255,255,255,0.8)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.2)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(sx - sR, sy - sR, sR * 2, sR * 2);
        ctx.restore();
      }
    }
  }

  for (var le = 0; le < lineEffects.length; le++) {
    var e = lineEffects[le];
    if (e.progress >= 1) continue;
    var alpha = 1 - e.progress;
    var expand = e.progress * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (e.dir === 'h') {
      var lx = offsetX;
      var ly = offsetY + (e.row + 0.5) * cellSize - cellSize * (0.5 + expand);
      var lw = COLS * cellSize;
      var lh = cellSize * (1 + expand * 2);
      var grad = ctx.createLinearGradient(lx, ly, lx, ly + lh);
      grad.addColorStop(0, 'rgba(255,100,0,0)');
      grad.addColorStop(0.3, 'rgba(255,180,0,0.5)');
      grad.addColorStop(0.5, 'rgba(255,220,50,0.9)');
      grad.addColorStop(0.7, 'rgba(255,180,0,0.5)');
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lx, ly, lw, lh);
    } else {
      var lx = offsetX + (e.col + 0.5) * cellSize - cellSize * (0.5 + expand);
      var ly = offsetY;
      var lw = cellSize * (1 + expand * 2);
      var lh = ROWS * cellSize;
      var grad = ctx.createLinearGradient(lx, ly, lx + lw, ly);
      grad.addColorStop(0, 'rgba(255,100,0,0)');
      grad.addColorStop(0.3, 'rgba(255,180,0,0.5)');
      grad.addColorStop(0.5, 'rgba(255,220,50,0.9)');
      grad.addColorStop(0.7, 'rgba(255,180,0,0.5)');
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lx, ly, lw, lh);
    }
    ctx.restore();
  }

  for (var be = 0; be < bombEffects.length; be++) {
    var b = bombEffects[be];
    if (b.progress >= 1) continue;
    var alpha = 1 - b.progress;
    var cx = offsetX + (b.col + 0.5) * cellSize;
    var cy = offsetY + (b.row + 0.5) * cellSize;
    var baseR = cellSize * 1.6;
    var r = baseR + b.progress * cellSize * 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.addColorStop(0, 'rgba(255,220,80,0.95)');
    bg.addColorStop(0.25, 'rgba(255,160,0,0.7)');
    bg.addColorStop(0.5, 'rgba(255,100,0,0.4)');
    bg.addColorStop(0.8, 'rgba(200,50,0,0.1)');
    bg.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  for (var i = 0; i < eliminateParticles.length; i++) {
    var p = eliminateParticles[i];
    var lifeRatio = p.life / p.maxLife;
    var op = lifeRatio * lifeRatio;
    var radius = 3 + 4 * lifeRatio;
    if (i % 3 === 0 && (p.prevX !== p.x || p.prevY !== p.y)) {
      ctx.save();
      ctx.globalAlpha = op * 0.5;
      ctx.strokeStyle = COLORS[p.colorIndex] || '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = op;
    ctx.fillStyle = COLORS[p.colorIndex] || '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (comboText && comboText.progress < 1) {
    var cp = comboText.progress;
    var comboScale = cp < 0.15 ? cp / 0.15 : (cp > 0.7 ? (1 - cp) / 0.3 : 1);
    var comboAlpha = cp > 0.6 ? (1 - cp) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = comboAlpha;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#f1c40f';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (20 + comboScale * 8) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText(comboText.text, w / 2, offsetY - 25);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.strokeText(comboText.text, w / 2, offsetY - 25);
    ctx.fillText(comboText.text, w / 2, offsetY - 25);
    ctx.restore();
  }

  if (swapAnim) {
    var p = swapAnim.progress;
    var ease = easeOutBack(p);
    var x1 = offsetX + swapAnim.c1 * cellSize;
    var y1 = offsetY + swapAnim.r1 * cellSize;
    var x2 = offsetX + swapAnim.c2 * cellSize;
    var y2 = offsetY + swapAnim.r2 * cellSize;
    var dx = (x2 - x1) * ease;
    var dy = (y2 - y1) * ease;
    var swapAlpha = 0.5 + 0.4 * Math.sin(p * Math.PI);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + swapAlpha + ')';
    ctx.lineWidth = 2;
    var sz = cellSize - pad * 2;
    ctx.strokeRect(x1 + pad + dx, y1 + pad - dy, sz, sz);
    ctx.strokeRect(x2 + pad - dx, y2 + pad + dy, sz, sz);
    ctx.restore();
    drawBubbleGem(x1 + pad + dx, y1 + pad - dy, cellSize - pad * 2, grid[swapAnim.r2][swapAnim.c2], 1, 1);
    drawBubbleGem(x2 + pad - dx, y2 + pad + dy, cellSize - pad * 2, grid[swapAnim.r1][swapAnim.c1], 1, 1);
  }

  for (let i = 0; i < dropAnims.length; i++) {
    var a = dropAnims[i];
    var p = Math.min(a.progress, 1);
    var easeY = easeOutDrop(p);
    var fromX = offsetX + a.fromC * cellSize;
    var fromY = offsetY + a.fromR * cellSize;
    var toX = offsetX + a.toC * cellSize;
    var toY = offsetY + a.toR * cellSize;
    var x = fromX + (toX - fromX) * easeY;
    var y = fromY + (toY - fromY) * easeY;
    var squash = getDropSquash(p);
    if (p < 0.99) {
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowOffsetY = 4;
    }
    if (a.type >= 0 && a.type < GEM_TYPES) {
      drawBubbleGem(x + pad, y + pad, cellSize - pad * 2, a.type, 1, 1, squash.scaleX, squash.scaleY);
    } else if (a.type === LINE_H || a.type === LINE_V || a.type === BOMB) {
      drawSpecialBlock(x + pad, y + pad, cellSize - pad * 2, a.type);
    }
    if (p < 0.99) {
      ctx.restore();
    }
  }

  for (let i = 0; i < fillAnims.length; i++) {
    var a = fillAnims[i];
    var p = Math.min(a.progress, 1);
    var ease = easeOutBackFill(p);
    var x = offsetX + a.c * cellSize + pad;
    var y = offsetY + a.r * cellSize + pad - (1 - ease) * cellSize;
    var fillScale = p < 1 ? 0.82 + ease * 0.2 : 1;
    if (fillScale > 1) fillScale = 1;
    drawBubbleGem(x, y, cellSize - pad * 2, a.type, fillScale, 1);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const key = r + ',' + c;
      if (isWall(r, c)) {
        var box = cellSize - pad * 2;
        var cr = Math.max(2, Math.min(box / 5, 6));
        roundRectPath(ctx, x + pad, y + pad, box, box, cr);
        ctx.fillStyle = USE_SIMPLE_GRID ? '#4a4a6a' : '#3d3d5c';
        ctx.fill();
        ctx.strokeStyle = USE_SIMPLE_GRID ? '#6a6a9a' : '#5c5c8a';
        ctx.lineWidth = USE_SIMPLE_GRID ? 2 : 1;
        ctx.stroke();
      } else if (grid[r][c] < 0 && (!fillSet || !fillSet.has(key)) && (!dropTargetSet || !dropTargetSet.has(key))) {
        var cr0 = Math.max(2, Math.min(cellSize / 5, 6));
        roundRectPath(ctx, x, y, cellSize, cellSize, cr0);
        ctx.fillStyle = (iceGrid[r] && iceGrid[r][c] > 0) ? 'rgba(200,230,255,0.45)' : (USE_SIMPLE_GRID ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)');
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  if (overlay === 'win' || overlay === 'fail') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);
    var panelW = 220;
    var panelH = overlay === 'win' ? 218 : 170;
    var panelX = contentX + (contentWidth - panelW) / 2;
    var panelY = contentY + (contentHeight - panelH) / 2;
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = '#eee';
    ctx.font = '18px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText(overlay === 'win' ? '胜利！' : '步数用尽', contentX + contentWidth / 2, panelY + 32);
    if (overlay === 'win' && lastEarnedStars >= 1) {
      ctx.font = '16px ' + FONT_FAMILY;
      ctx.fillText('获得 ' + '★'.repeat(lastEarnedStars) + '☆'.repeat(3 - lastEarnedStars) + ' 星', contentX + contentWidth / 2, panelY + 50);
    }
    var btnW = 100;
    var btnH = 36;
    var btnX = (w - btnW) / 2;
    var btnY = overlay === 'win' ? panelY + 124 : panelY + 52;
    if (overlay === 'win') {
      updateRankMinipanel(getTotalScoreForRank());
      try {
        var openCtx = wx.getOpenDataContext && wx.getOpenDataContext();
        if (openCtx && openCtx.canvas && openCtx.canvas.width === MINIPANEL_W) {
          var mpY = panelY + (lastEarnedStars >= 1 ? 62 : 42);
          ctx.drawImage(openCtx.canvas, 0, 0, MINIPANEL_W, MINIPANEL_H, contentX + (contentWidth - MINIPANEL_W) / 2, mpY, MINIPANEL_W, MINIPANEL_H);
        }
      } catch (e) {}
    }
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = '16px ' + FONT_FAMILY;
    ctx.fillText(overlay === 'win' ? '下一关' : '重试', contentX + contentWidth / 2, btnY + 24);
    var btnMapY;
    if (overlay === 'fail') {
      var buyBtnW = 130;
      var buyBtnH = 26;
      var buyBtnX = (w - buyBtnW) / 2;
      var buyBtnY = panelY + 94;
      ctx.fillStyle = '#5c5c7a';
      ctx.fillRect(buyBtnX, buyBtnY, buyBtnW, buyBtnH);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.fillText('50金币购买3步', contentX + contentWidth / 2, buyBtnY + buyBtnH / 2 + 4);
      btnBuyStepsRect = { x: buyBtnX, y: buyBtnY, w: buyBtnW, h: buyBtnH };
      btnMapY = panelY + 126;
    } else {
      btnBuyStepsRect = null;
      btnMapY = panelY + 168;
    }
    ctx.fillStyle = '#5c5c8a';
    ctx.fillRect(btnX, btnMapY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = '16px ' + FONT_FAMILY;
    ctx.fillText('返回', contentX + contentWidth / 2, btnMapY + 24);
    btnMapRect = { x: btnX, y: btnMapY, w: btnW, h: btnH };
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
    btnBuyStepsRect = null;
    btnMapRect = null;
  }
  // 对局中且无结算遮罩时，在最后一笔再绘一次排名面板，保证始终在最上层且使用最新 sharedCanvas（对局中不刷新得分，仅用 rankDisplayScore）
  if (gameScene === 'play' && overlay !== 'win' && overlay !== 'fail') {
    try {
      var openCtxLast = wx.getOpenDataContext && wx.getOpenDataContext();
      if (openCtxLast && openCtxLast.canvas) {
        if (openCtxLast.canvas.width !== MINIPANEL_W || openCtxLast.canvas.height !== MINIPANEL_H) {
          openCtxLast.canvas.width = MINIPANEL_W;
          openCtxLast.canvas.height = MINIPANEL_H;
          openCtxLast.postMessage({ type: 'minipanel', score: Math.floor(rankDisplayScore) });
        }
        if (openCtxLast.canvas.width === MINIPANEL_W) {
          ctx.drawImage(openCtxLast.canvas, 0, 0, MINIPANEL_W, MINIPANEL_H, rankPanelX, rankPanelY, MINIPANEL_W, MINIPANEL_H);
        }
      }
    } catch (e) {}
  }
  if (screenShakeFrames > 0) ctx.restore();
}

function bindTouch() {
  wx.onTouchStart(onTouchStart);
  wx.onTouchEnd(onTouchEnd);
  wx.onTouchCancel(onTouchCancel);
}

function main() {
  if (typeof wx !== 'undefined' && wx.cloud && CLOUD_ENV) {
    try { wx.cloud.init({ env: CLOUD_ENV }); } catch (e) {}
  }
  initCanvas();
  loadGemImages();
  loadBackgroundImage();
  if (typeof wx !== 'undefined' && wx.loadFont) {
    try {
      var loaded = wx.loadFont('fonts/cartoon.ttf') || wx.loadFont('fonts/ZCOOLKuaiLe-Regular.ttf');
      if (loaded && typeof loaded === 'string') FONT_FAMILY = loaded;
    } catch (e) {}
  }
  bindTouch();
  saveData = loadSave();
  resetDailyWeeklyIfNeeded();
  rankDisplayScore = getTotalScoreForRank();
  if (typeof wx !== 'undefined' && wx.setUserCloudStorage) submitScoreForRank(getTotalScoreForRank());
  gameScene = 'start';
  renderStart();
  if (typeof wx !== 'undefined' && wx.cloud && CLOUD_ENV) {
    dataService.ensureUser(function (res) {
      if (!res.ok || !res.userId) return;
      currentUserId = res.userId;
      persistProgressToCloud();
      if (currentUserId && typeof dataService.submitGlobalRank === 'function') {
        dataService.submitGlobalRank(currentUserId, getTotalScoreForRank(), function () {});
      }
      dataService.getProgress(currentUserId, function (prog) {
        if (!prog.ok || !prog.data) return;
        var cloudData = prog.data;
        var localUpdated = (saveData && saveData.updatedAt) ? saveData.updatedAt : 0;
        var cloudUpdated = (cloudData && cloudData.updatedAt) ? cloudData.updatedAt : 0;
        var localGold = (saveData && typeof saveData.gold === 'number') ? saveData.gold : 0;
        var cloudGold = typeof cloudData.gold === 'number' ? cloudData.gold : 0;
        var doFullMerge = cloudUpdated >= localUpdated && cloudData.maxUnlockedLevel != null;
        var doRecoveryMerge = !doFullMerge && localGold === 0 && cloudGold > 0;
        if (doFullMerge) {
          saveData = saveData || getDefaultSave();
          saveData.maxUnlockedLevel = cloudData.maxUnlockedLevel;
          if (cloudData.stars && typeof cloudData.stars === 'object') saveData.stars = cloudData.stars;
          if (cloudData.bestScorePerLevel && typeof cloudData.bestScorePerLevel === 'object') saveData.bestScorePerLevel = cloudData.bestScorePerLevel;
          saveData.updatedAt = cloudUpdated;
          if (typeof cloudData.gold === 'number') saveData.gold = cloudData.gold;
          if (typeof cloudData.stamina === 'number') saveData.stamina = cloudData.stamina;
          if (typeof cloudData.lastStaminaTime === 'number') saveData.lastStaminaTime = cloudData.lastStaminaTime;
          if (cloudData.taskProgress && typeof cloudData.taskProgress === 'object') saveData.taskProgress = cloudData.taskProgress;
          if (Array.isArray(cloudData.taskEvents)) saveData.taskEvents = cloudData.taskEvents;
          if (typeof cloudData.lastDailyReset === 'string') saveData.lastDailyReset = cloudData.lastDailyReset;
          if (typeof cloudData.lastWeeklyReset === 'string') saveData.lastWeeklyReset = cloudData.lastWeeklyReset;
          if (typeof cloudData.sessionActive === 'boolean') saveData.sessionActive = cloudData.sessionActive;
          if (typeof cloudData.resumableLevelId === 'number') saveData.resumableLevelId = cloudData.resumableLevelId;
          if (cloudData.levelStuckCount && typeof cloudData.levelStuckCount === 'object') saveData.levelStuckCount = cloudData.levelStuckCount;
          if (cloudData.levelAdjustments && typeof cloudData.levelAdjustments === 'object') saveData.levelAdjustments = cloudData.levelAdjustments;
          if (typeof cloudData.fourMatchRewardCounter === 'number') saveData.fourMatchRewardCounter = cloudData.fourMatchRewardCounter;
          if (typeof cloudData.fourMatchGoldClaimedDate === 'string') saveData.fourMatchGoldClaimedDate = cloudData.fourMatchGoldClaimedDate;
          if (typeof cloudData.fourMatchGoldClaimedToday === 'number') saveData.fourMatchGoldClaimedToday = cloudData.fourMatchGoldClaimedToday;
          saveSave(saveData);
          rankDisplayScore = getTotalScoreForRank();
          if (currentUserId && typeof dataService.submitGlobalRank === 'function') {
            dataService.submitGlobalRank(currentUserId, getTotalScoreForRank(), function () {});
          }
          renderStart();
        } else if (doRecoveryMerge) {
          saveData = saveData || getDefaultSave();
          if (typeof cloudData.gold === 'number') saveData.gold = cloudData.gold;
          if (typeof cloudData.stamina === 'number') saveData.stamina = cloudData.stamina;
          if (typeof cloudData.lastStaminaTime === 'number') saveData.lastStaminaTime = cloudData.lastStaminaTime;
          if (cloudData.taskProgress && typeof cloudData.taskProgress === 'object') saveData.taskProgress = cloudData.taskProgress;
          if (Array.isArray(cloudData.taskEvents)) saveData.taskEvents = cloudData.taskEvents;
          if (typeof cloudData.fourMatchRewardCounter === 'number') saveData.fourMatchRewardCounter = cloudData.fourMatchRewardCounter;
          if (typeof cloudData.fourMatchGoldClaimedDate === 'string') saveData.fourMatchGoldClaimedDate = cloudData.fourMatchGoldClaimedDate;
          if (typeof cloudData.fourMatchGoldClaimedToday === 'number') saveData.fourMatchGoldClaimedToday = cloudData.fourMatchGoldClaimedToday;
          if (cloudData.maxUnlockedLevel != null) saveData.maxUnlockedLevel = cloudData.maxUnlockedLevel;
          if (cloudData.stars && typeof cloudData.stars === 'object') saveData.stars = cloudData.stars;
          if (cloudData.bestScorePerLevel && typeof cloudData.bestScorePerLevel === 'object') saveData.bestScorePerLevel = cloudData.bestScorePerLevel;
          saveData.updatedAt = Math.max(localUpdated, cloudUpdated);
          saveSave(saveData);
          rankDisplayScore = getTotalScoreForRank();
          renderStart();
        }
      });
    });
  }
  if (typeof wx !== 'undefined') {
    try {
      wx.showShareMenu && wx.showShareMenu({ withShareTimeline: true });
      wx.onShareAppMessage && wx.onShareAppMessage(function () {
        shareIntentTime = Date.now();
        shareTaskCountedThisSession = false;
        return { title: '萌兽三消', imageUrl: lastShareImagePath || '' };
      });
      wx.onShareTimeline && wx.onShareTimeline(function () {
        return { title: '萌兽三消', imageUrl: lastShareImagePath || '' };
      });
      // 分享任务回退：微信部分场景下 shareAppMessage 的 success 不触发，用户从分享返回时视为完成一次分享
      wx.onShow && wx.onShow(function () {
        if (shareIntentTime > 0 && (Date.now() - shareIntentTime) < 120000 && !shareTaskCountedThisSession) {
          tryCountShareTask();
        }
        shareIntentTime = 0;
        if (gameScene === 'start') renderStart();
      });
    } catch (e) {}
  }
}

main();
