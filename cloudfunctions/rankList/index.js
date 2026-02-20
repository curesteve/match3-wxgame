const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(event.limit, 10) || 50));
    const col = db.collection('global_rank');
    const res = await col.orderBy('totalScore', 'desc').limit(limit).get();
    const list = (res.data || []).map(function (doc, i) {
      return {
        rank: i + 1,
        userId: doc.userId,
        totalScore: doc.totalScore != null ? doc.totalScore : 0
      };
    });
    return { ok: true, list: list };
  } catch (e) {
    return { ok: false, message: e.message, list: [] };
  }
};
