const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    const data = event.data;
    if (!userId || !data) return { ok: false, message: 'missing userId or data' };
    const col = db.collection('game_save');
    const payload = {
      userId: userId,
      maxUnlockedLevel: data.maxUnlockedLevel != null ? data.maxUnlockedLevel : 1,
      stars: data.stars && typeof data.stars === 'object' ? data.stars : {},
      bestScorePerLevel: data.bestScorePerLevel && typeof data.bestScorePerLevel === 'object' ? data.bestScorePerLevel : {},
      updatedAt: data.updatedAt || Date.now()
    };
    const res = await col.where({ userId: userId }).get();
    if (res.data && res.data.length > 0) {
      await col.doc(res.data[0]._id).update({ data: payload });
    } else {
      await col.add({ data: payload });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
