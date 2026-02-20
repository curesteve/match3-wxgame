const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 从客户端上报的 data 中提取并规范化要持久化的完整进度，避免进程关闭后丢失 */
function buildPayload(userId, data) {
  const now = data.updatedAt || Date.now();
  return {
    userId: userId,
    version: data.version != null ? data.version : 1,
    maxUnlockedLevel: data.maxUnlockedLevel != null ? data.maxUnlockedLevel : 1,
    stars: data.stars && typeof data.stars === 'object' ? data.stars : {},
    bestScorePerLevel: data.bestScorePerLevel && typeof data.bestScorePerLevel === 'object' ? data.bestScorePerLevel : {},
    updatedAt: now,
    gold: typeof data.gold === 'number' ? data.gold : 0,
    stamina: typeof data.stamina === 'number' ? data.stamina : 5,
    lastStaminaTime: typeof data.lastStaminaTime === 'number' ? data.lastStaminaTime : 0,
    taskProgress: data.taskProgress && typeof data.taskProgress === 'object' ? data.taskProgress : {},
    taskEvents: Array.isArray(data.taskEvents) ? data.taskEvents : [],
    lastDailyReset: typeof data.lastDailyReset === 'string' ? data.lastDailyReset : '',
    lastWeeklyReset: typeof data.lastWeeklyReset === 'string' ? data.lastWeeklyReset : '',
    sessionActive: typeof data.sessionActive === 'boolean' ? data.sessionActive : false,
    resumableLevelId: typeof data.resumableLevelId === 'number' ? data.resumableLevelId : 1,
    levelStuckCount: data.levelStuckCount && typeof data.levelStuckCount === 'object' ? data.levelStuckCount : {},
    levelAdjustments: data.levelAdjustments && typeof data.levelAdjustments === 'object' ? data.levelAdjustments : {},
    fourMatchRewardCounter: typeof data.fourMatchRewardCounter === 'number' ? data.fourMatchRewardCounter : 0,
    fourMatchGoldClaimedDate: typeof data.fourMatchGoldClaimedDate === 'string' ? data.fourMatchGoldClaimedDate : '',
    fourMatchGoldClaimedToday: typeof data.fourMatchGoldClaimedToday === 'number' ? data.fourMatchGoldClaimedToday : 0
  };
}

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    const data = event.data;
    if (!userId || !data) return { ok: false, message: 'missing userId or data' };
    const col = db.collection('game_save');
    const payload = buildPayload(userId, data);
    const res = await col.where({ userId: userId }).get();
    const updatePayload = { data: payload };
    if (res.data && res.data.length > 0) {
      await col.doc(res.data[0]._id).update(updatePayload);
    } else {
      await col.add(updatePayload);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
