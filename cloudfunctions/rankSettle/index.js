const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 兼容文档为顶层字段或 doc.data 嵌套的两种存储格式 */
function getDocField(doc, field) {
  const raw = doc.data && typeof doc.data === 'object' ? doc.data : doc;
  return raw[field];
}

/** 奖励档位配置：按周期类型与排名区间发放金币（可改为从配置或环境变量读取） */
const REWARD_TIERS = {
  day: [
    { maxRank: 1, gold: 100 },
    { maxRank: 3, gold: 50 },
    { maxRank: 10, gold: 20 }
  ],
  week: [
    { maxRank: 1, gold: 500 },
    { maxRank: 10, gold: 200 },
    { maxRank: 30, gold: 50 }
  ],
  month: [
    { maxRank: 1, gold: 1000 },
    { maxRank: 10, gold: 500 },
    { maxRank: 50, gold: 100 }
  ]
};

function getGoldForRank(periodType, rank) {
  const tiers = REWARD_TIERS[periodType] || REWARD_TIERS.day;
  for (let i = 0; i < tiers.length; i++) {
    if (rank <= tiers[i].maxRank) return tiers[i].gold;
  }
  return 0;
}

/** 北京时间 UTC+8：当前时刻的昨日 dayKey、上周 weekKey、上月 monthKey（用于 0:05 定时结算） */
function getSettlePeriodKeys() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const y = bj.getUTCFullYear();
  const m = bj.getUTCMonth();
  const d = bj.getUTCDate();
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  const yesterday = new Date(Date.UTC(y, m, d - 1));
  const dayKey = yesterday.getUTCFullYear() + '-' + pad2(yesterday.getUTCMonth() + 1) + '-' + pad2(yesterday.getUTCDate());
  const dayOfWeek = (bj.getUTCDay() + 6) % 7;
  const lastMonday = new Date(Date.UTC(y, m, d - dayOfWeek - 7));
  const ly = lastMonday.getUTCFullYear();
  const lm = lastMonday.getUTCMonth();
  const ld = lastMonday.getUTCDate();
  const jan1 = new Date(Date.UTC(ly, 0, 1));
  const weekNum = Math.floor((lastMonday - jan1) / (7 * 86400000)) + 1;
  const weekKey = ly + '-W' + pad2(weekNum);
  const lastMonth = m === 0 ? { y: y - 1, m: 11 } : { y: y, m: m - 1 };
  const monthKey = lastMonth.y + '-' + pad2(lastMonth.m + 1);
  return { day: dayKey, week: weekKey, month: monthKey };
}

async function settleOne(rankCol, settleCol, periodType, periodKey) {
  const res = await rankCol
    .where({ periodType: periodType, periodKey: periodKey })
    .orderBy('totalScore', 'desc')
    .limit(500)
    .get();
  const data = res.data || [];
  const now = Date.now();
  for (let i = 0; i < data.length; i++) {
    const doc = data[i];
    const rank = i + 1;
    const goldGranted = getGoldForRank(periodType, rank);
    if (goldGranted <= 0) continue;
    const uid = getDocField(doc, 'userId');
    const score = getDocField(doc, 'totalScore');
    await settleCol.add({
      data: {
        userId: uid,
        periodType: periodType,
        periodKey: periodKey,
        rank: rank,
        totalScore: score != null ? score : 0,
        goldGranted: goldGranted,
        claimed: false,
        createdAt: now
      }
    });
  }
  return data.length;
}

exports.main = async (event, context) => {
  try {
    const rankCol = db.collection('global_rank');
    const settleCol = db.collection('rank_settlements');
    const keys = getSettlePeriodKeys();
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const isMonday = bj.getUTCDay() === 1;
    const isFirst = bj.getUTCDate() === 1;
    let dayCount = await settleOne(rankCol, settleCol, 'day', keys.day);
    let weekCount = 0;
    let monthCount = 0;
    if (isMonday) weekCount = await settleOne(rankCol, settleCol, 'week', keys.week);
    if (isFirst) monthCount = await settleOne(rankCol, settleCol, 'month', keys.month);
    return { ok: true, day: dayCount, week: weekCount, month: monthCount };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
