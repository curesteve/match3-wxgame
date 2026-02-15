const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function getDefaultSave() {
  return {
    version: 1,
    maxUnlockedLevel: 1,
    stars: {},
    bestScorePerLevel: {},
    updatedAt: 0
  };
}

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    if (!userId) return { ok: false, message: 'no userId' };
    const col = db.collection('game_save');
    const res = await col.where({ userId: userId }).get();
    if (res.data && res.data.length > 0) {
      const doc = res.data[0];
      return {
        ok: true,
        data: {
          version: doc.version != null ? doc.version : 1,
          maxUnlockedLevel: doc.maxUnlockedLevel != null ? doc.maxUnlockedLevel : 1,
          stars: doc.stars && typeof doc.stars === 'object' ? doc.stars : {},
          bestScorePerLevel: doc.bestScorePerLevel && typeof doc.bestScorePerLevel === 'object' ? doc.bestScorePerLevel : {},
          updatedAt: doc.updatedAt || 0
        }
      };
    }
    return { ok: true, data: getDefaultSave() };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
