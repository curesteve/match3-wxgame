const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return { ok: false, message: 'no openid' };
    const now = Date.now();
    const users = db.collection('users');
    const res = await users.where({ _id: openid }).get();
    if (res.data && res.data.length > 0) {
      await users.doc(openid).update({ data: { lastLoginAt: now } });
    } else {
      await users.add({
        data: {
          _id: openid,
          openid: openid,
          createdAt: now,
          lastLoginAt: now
        }
      });
    }
    return { ok: true, userId: openid };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
