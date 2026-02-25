const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 兼容文档为顶层字段或 doc.data 嵌套的两种存储格式 */
function getDocField(doc, field) {
  const raw = doc.data && typeof doc.data === 'object' ? doc.data : doc;
  return raw[field];
}

exports.main = async (event, context) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(event.limit, 10) || 50));
    const periodType = event.periodType || 'day';
    const periodKey = event.periodKey || '';
    const userId = event.userId || null;
    if (!periodKey) return { ok: false, message: 'missing periodKey', list: [] };
    const col = db.collection('global_rank');
    const res = await col
      .where({ periodType: periodType, periodKey: periodKey })
      .orderBy('totalScore', 'desc')
      .limit(limit)
      .get();
    const data = res.data || [];
    const list = data.map(function (doc, i) {
      const uid = getDocField(doc, 'userId');
      const score = getDocField(doc, 'totalScore');
      const nick = getDocField(doc, 'nickName');
      return {
        rank: i + 1,
        userId: uid,
        totalScore: score != null ? score : 0,
        nickName: nick != null && nick !== '' ? String(nick).trim() : ''
      };
    });
    let myRank = null;
    if (userId) {
      const idx = data.findIndex(function (d) { return getDocField(d, 'userId') === userId; });
      if (idx >= 0) {
        const score = getDocField(data[idx], 'totalScore');
        myRank = { rank: idx + 1, totalScore: score != null ? score : 0 };
      } else {
        const myDoc = await col.where({ userId: userId, periodType: periodType, periodKey: periodKey }).get();
        if (myDoc.data && myDoc.data.length > 0) {
          const score = getDocField(myDoc.data[0], 'totalScore');
          const above = await col.where({
            periodType: periodType,
            periodKey: periodKey,
            totalScore: db.command.gt(score != null ? score : 0)
          }).count();
          myRank = { rank: above.total + 1, totalScore: score != null ? score : 0 };
        }
      }
    }
    return { ok: true, list: list, myRank: myRank };
  } catch (e) {
    return { ok: false, message: e.message, list: [] };
  }
};
