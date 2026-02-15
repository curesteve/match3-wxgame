const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const userId = event.userId;
    const record = event.record;
    if (!userId || !record) return { ok: false, message: 'missing userId or record' };
    const col = db.collection('game_records');
    await col.add({
      data: {
        userId: userId,
        levelId: record.levelId,
        durationSec: record.durationSec,
        movesUsed: record.movesUsed,
        totalMoves: record.totalMoves,
        score: record.score,
        stars: record.stars,
        elim3: record.elim3,
        elim4: record.elim4,
        elim5: record.elim5,
        elim6Plus: record.elim6Plus,
        win: record.win,
        timestamp: record.timestamp || Date.now()
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
