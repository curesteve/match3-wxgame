const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 兼容文档为顶层字段或 doc.data 嵌套的两种存储格式 */
function getDocField(doc, field) {
  const raw = doc.data && typeof doc.data === 'object' ? doc.data : doc;
  return raw[field];
}

/** 北京时间 UTC+8 下的当日、当周、当月 periodKey */
function getBeijingPeriodKeys() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const y = bj.getUTCFullYear();
  const m = bj.getUTCMonth();
  const d = bj.getUTCDate();
  const dayKey = y + '-' + pad2(m + 1) + '-' + pad2(d);
  const monthKey = y + '-' + pad2(m + 1);
  const dayOfWeek = (bj.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m, d - dayOfWeek));
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const weekNum = Math.floor((monday - jan1) / (7 * 86400000)) + 1;
  const weekKey = y + '-W' + pad2(weekNum);
  return { day: dayKey, week: weekKey, month: monthKey };
}
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    const totalScore = event.totalScore != null ? Math.max(0, Math.floor(Number(event.totalScore))) : 0;
    const nickName = event.nickName != null ? String(event.nickName).slice(0, 32) : '';
    if (!userId) return { ok: false, message: 'missing userId' };
    const col = db.collection('global_rank');
    const now = Date.now();
    const periods = getBeijingPeriodKeys();
    const types = [
      { periodType: 'day', periodKey: periods.day },
      { periodType: 'week', periodKey: periods.week },
      { periodType: 'month', periodKey: periods.month }
    ];
    for (const { periodType, periodKey } of types) {
      const res = await col.where({ userId, periodType, periodKey }).get();
      if (res.data && res.data.length > 0) {
        const existing = res.data[0];
        const oldScore = getDocField(existing, 'totalScore');
        const oldNick = getDocField(existing, 'nickName');
        const oldScoreNum = oldScore != null ? Number(oldScore) : 0;
        if (totalScore > oldScoreNum) {
          const updateData = { totalScore: totalScore, updatedAt: now };
          if (nickName) updateData.nickName = nickName;
          await col.doc(existing._id).update({ data: updateData });
        } else if (nickName && String(oldNick || '').trim() !== nickName.trim()) {
          await col.doc(existing._id).update({ data: { nickName: nickName, updatedAt: now } });
        }
      } else {
        const addData = {
          userId,
          periodType,
          periodKey,
          totalScore: totalScore,
          updatedAt: now
        };
        if (nickName) addData.nickName = nickName;
        await col.add({ data: addData });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
