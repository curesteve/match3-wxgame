const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function getDefaultSave() {
  return {
    version: 1,
    maxUnlockedLevel: 1,
    stars: {},
    bestScorePerLevel: {},
    updatedAt: 0,
    gold: 0,
    stamina: 5,
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

/** 从数据库文档中取出 data 对象（新格式存于 data 字段；兼容旧文档可能只有顶层字段） */
function getDataFromDoc(doc) {
  const raw = doc.data && typeof doc.data === 'object' ? doc.data : doc;
  return {
    version: raw.version != null ? raw.version : 1,
    maxUnlockedLevel: raw.maxUnlockedLevel != null ? raw.maxUnlockedLevel : 1,
    stars: raw.stars && typeof raw.stars === 'object' ? raw.stars : {},
    bestScorePerLevel: raw.bestScorePerLevel && typeof raw.bestScorePerLevel === 'object' ? raw.bestScorePerLevel : {},
    updatedAt: raw.updatedAt || 0,
    gold: typeof raw.gold === 'number' ? raw.gold : 0,
    stamina: typeof raw.stamina === 'number' ? raw.stamina : 5,
    lastStaminaTime: typeof raw.lastStaminaTime === 'number' ? raw.lastStaminaTime : 0,
    taskProgress: raw.taskProgress && typeof raw.taskProgress === 'object' ? raw.taskProgress : {},
    taskEvents: Array.isArray(raw.taskEvents) ? raw.taskEvents : [],
    lastDailyReset: typeof raw.lastDailyReset === 'string' ? raw.lastDailyReset : '',
    lastWeeklyReset: typeof raw.lastWeeklyReset === 'string' ? raw.lastWeeklyReset : '',
    sessionActive: typeof raw.sessionActive === 'boolean' ? raw.sessionActive : false,
    resumableLevelId: typeof raw.resumableLevelId === 'number' ? raw.resumableLevelId : 1,
    levelStuckCount: raw.levelStuckCount && typeof raw.levelStuckCount === 'object' ? raw.levelStuckCount : {},
    levelAdjustments: raw.levelAdjustments && typeof raw.levelAdjustments === 'object' ? raw.levelAdjustments : {},
    fourMatchRewardCounter: typeof raw.fourMatchRewardCounter === 'number' ? raw.fourMatchRewardCounter : 0,
    fourMatchGoldClaimedDate: typeof raw.fourMatchGoldClaimedDate === 'string' ? raw.fourMatchGoldClaimedDate : '',
    fourMatchGoldClaimedToday: typeof raw.fourMatchGoldClaimedToday === 'number' ? raw.fourMatchGoldClaimedToday : 0
  };
}

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    if (!userId) return { ok: false, message: 'no userId' };
    const col = db.collection('game_save');
    const res = await col.where({ userId: userId }).get();
    let data = res.data && res.data.length > 0 ? getDataFromDoc(res.data[0]) : getDefaultSave();
    const settleCol = db.collection('rank_settlements');
    const unclaimed = await settleCol.where({ userId: userId, claimed: false }).get();
    if (unclaimed.data && unclaimed.data.length > 0) {
      let extraGold = 0;
      for (let i = 0; i < unclaimed.data.length; i++) {
        extraGold += unclaimed.data[i].goldGranted != null ? unclaimed.data[i].goldGranted : 0;
        await settleCol.doc(unclaimed.data[i]._id).update({ data: { claimed: true } });
      }
      data.gold = (typeof data.gold === 'number' ? data.gold : 0) + extraGold;
    }
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
