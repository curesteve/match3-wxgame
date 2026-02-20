const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    const totalScore = event.totalScore != null ? Math.max(0, Math.floor(Number(event.totalScore))) : 0;
    if (!userId) return { ok: false, message: 'missing userId' };
    const col = db.collection('global_rank');
    const now = Date.now();
    const res = await col.where({ userId: userId }).get();
    if (res.data && res.data.length > 0) {
      await col.doc(res.data[0]._id).update({
        data: { totalScore: totalScore, updatedAt: now }
      });
    } else {
      await col.add({
        data: { userId: userId, totalScore: totalScore, updatedAt: now }
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
