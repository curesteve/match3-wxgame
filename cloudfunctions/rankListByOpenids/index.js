const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const openids = event.openids || [];
    const periodType = event.periodType || 'day';
    const periodKey = event.periodKey || '';
    if (!periodKey || !Array.isArray(openids) || openids.length === 0) {
      return { ok: true, list: [] };
    }
    const col = db.collection('global_rank');
    const res = await col
      .where({
        periodType: periodType,
        periodKey: periodKey,
        userId: db.command.in(openids)
      })
      .orderBy('totalScore', 'desc')
      .limit(100)
      .get();
    const data = res.data || [];
    const list = data.map(function (doc, i) {
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
