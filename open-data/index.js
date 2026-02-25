/**
 * 开放数据域入口：好友排行榜（仅积分，支持日/周/月榜）
 */
var sharedCanvas = wx.getSharedCanvas();
var ctx = sharedCanvas.getContext('2d');
var RANK_KEY = 'score';
var list = [];
var loading = true;
var errMsg = '';
var currentPeriodType = 'day';
var currentPeriodKey = '';
var cloudEnv = '';
var useTotalScoreFallback = false;
var FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif';
if (typeof wx !== 'undefined' && wx.loadFont) {
  try {
    var loaded = wx.loadFont('fonts/cartoon.ttf') || wx.loadFont('fonts/ZCOOLKuaiLe-Regular.ttf');
    if (loaded && typeof loaded === 'string') FONT_FAMILY = loaded;
  } catch (e) {}
}

function getPeriodTitle() {
  if (useTotalScoreFallback) return '好友积分榜';
  if (currentPeriodType === 'week') return '好友周榜';
  if (currentPeriodType === 'month') return '好友月榜';
  return '好友日榜';
}

function drawRank() {
  var w = sharedCanvas.width || 300;
  var h = sharedCanvas.height || 400;
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eee';
  ctx.font = '16px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  if (loading) {
    ctx.fillText('加载中…', w / 2, h / 2);
    return;
  }
  if (errMsg) {
    ctx.fillText(errMsg, w / 2, h / 2);
    return;
  }
  ctx.fillText(getPeriodTitle(), w / 2, 24);
  if (list.length === 0) {
    ctx.fillText('暂无好友数据', w / 2, h / 2);
    return;
  }
  var lineH = 32;
  var y = 44;
  for (var i = 0; i < list.length && y < h - 20; i++) {
    var item = list[i];
    var rank = item.rank != null ? item.rank : (i + 1);
    var name = (item.nickName || item.nickname || '') ? String(item.nickName || item.nickname).slice(0, 8) : ('玩家' + rank);
    var score = item.totalScore != null ? item.totalScore : (item.score != null ? item.score : 0);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(rank + '. ' + name, 16, y + 20);
    ctx.textAlign = 'right';
    ctx.fillText(String(score), w - 16, y + 20);
    ctx.textAlign = 'center';
    y += lineH;
  }
}

function fetchAndDrawByPeriod(periodType, periodKey) {
  currentPeriodType = periodType || 'day';
  currentPeriodKey = periodKey || '';
  loading = true;
  errMsg = '';
  list = [];
  drawRank();
  wx.getFriendCloudStorage({
    keyList: [RANK_KEY],
    success: function (res) {
      var friends = res.data || [];
      var openids = friends.map(function (u) { return u.openid || u.openId || ''; }).filter(Boolean);
      if (openids.length === 0) {
        loading = false;
        list = [];
        drawRank();
        return;
      }
      if (typeof wx.cloud === 'undefined' || !wx.cloud.callFunction) {
        loading = false;
        useTotalScoreFallback = true;
        fetchAndDrawTotalScore();
        return;
      }
      useTotalScoreFallback = false;
      if (cloudEnv && typeof wx.cloud.init === 'function') {
        try { wx.cloud.init({ env: cloudEnv }); } catch (e) {}
      }
      wx.cloud.callFunction({
        name: 'rankListByOpenids',
        data: { openids: openids, periodType: currentPeriodType, periodKey: currentPeriodKey }
      }).then(function (cfRes) {
        loading = false;
        var result = cfRes.result || {};
        var cloudList = (result.ok && result.list) ? result.list : [];
        var nameMap = {};
        for (var i = 0; i < friends.length; i++) {
          var o = friends[i].openid || friends[i].openId;
          if (o) nameMap[o] = friends[i].nickname || friends[i].nickName || '';
        }
        list = cloudList.map(function (item) {
          return {
            rank: item.rank,
            userId: item.userId,
            totalScore: item.totalScore,
            nickName: nameMap[item.userId] || ('玩家' + (item.rank || 0))
          };
        });
        drawRank();
      }).catch(function () {
        loading = false;
        errMsg = '加载失败';
        drawRank();
      });
    },
    fail: function () {
      loading = false;
      errMsg = '获取失败';
      drawRank();
    }
  });
}

function fetchAndDrawTotalScore() {
  currentPeriodType = 'day';
  currentPeriodKey = '';
  useTotalScoreFallback = true;
  loading = true;
  errMsg = '';
  list = [];
  drawRank();
  wx.getFriendCloudStorage({
    keyList: [RANK_KEY],
    success: function (res) {
      loading = false;
      var data = res.data || [];
      list = data.map(function (user, idx) {
        var score = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          var k = kvList[j].key || kvList[j].keyName;
          if (k === RANK_KEY) score = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
        }
        return { nickName: user.nickname || user.nickName, score: score, totalScore: score, openid: user.openid };
      });
      list.sort(function (a, b) { return (b.totalScore || 0) - (a.totalScore || 0); });
      for (var i = 0; i < list.length; i++) list[i].rank = i + 1;
      drawRank();
    },
    fail: function () {
      loading = false;
      errMsg = '获取失败';
      drawRank();
    }
  });
}

var minipanelW = 200;
var minipanelH = 52;
function drawMinipanel(rank, gapAbove) {
  var w = sharedCanvas.width || minipanelW;
  var h = sharedCanvas.height || minipanelH;
  ctx.fillStyle = 'rgba(22,33,62,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#4a7c9e';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = '14px ' + FONT_FAMILY;
  ctx.textAlign = 'left';
  if (rank === 'timeout' || rank === 'nocontext') {
    ctx.fillText('好友排名', 10, 20);
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillText(rank === 'timeout' ? '加载超时，请真机试玩' : '仅真机显示排名', 10, 40);
    return;
  }
  ctx.fillText('好友排名: 第' + rank + '名', 10, 20);
  if (gapAbove != null && gapAbove > 0) {
    ctx.fillText('距上一名: ' + gapAbove + '分', 10, 40);
  } else {
    ctx.fillText('已是第1名', 10, 40);
  }
}
function fetchAndDrawMinipanel(myScore) {
  if (myScore == null || typeof myScore !== 'number') myScore = 0;
  loading = true;
  list = [];
  var w = sharedCanvas.width || minipanelW;
  var h = sharedCanvas.height || minipanelH;
  ctx.fillStyle = 'rgba(22,33,62,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eee';
  ctx.font = '12px ' + FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.fillText('加载排名…', w / 2, h / 2);
  var resolved = false;
  function finish() {
    if (resolved) return;
    resolved = true;
    if (minipanelLoadTimer) clearTimeout(minipanelLoadTimer);
  }
  var minipanelLoadTimer = setTimeout(function () {
    finish();
    loading = false;
    drawMinipanel('timeout', null);
  }, 2500);
  wx.getFriendCloudStorage({
    keyList: [RANK_KEY],
    success: function (res) {
      finish();
      loading = false;
      var data = res.data || [];
      var arr = data.map(function (user) {
        var score = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          var k = kvList[j].key || kvList[j].keyName;
          if (k === RANK_KEY) score = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
        }
        return { score: score };
      });
      arr.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      var rank = 1;
      var gapAbove = null;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].score > myScore) {
          rank++;
          if (gapAbove == null) gapAbove = arr[i].score;
        }
      }
      if (gapAbove != null) gapAbove = gapAbove - myScore;
      drawMinipanel(rank, gapAbove);
    },
    fail: function () {
      finish();
      loading = false;
      drawMinipanel('nocontext', null);
    }
  });
}

wx.onMessage(function (msg) {
  if (msg.env) {
    cloudEnv = msg.env;
    if (typeof wx.cloud !== 'undefined' && typeof wx.cloud.init === 'function') {
      try { wx.cloud.init({ env: cloudEnv }); } catch (e) {}
    }
  }
  if (msg.type === 'refresh') {
    if (msg.periodType && msg.periodKey) {
      fetchAndDrawByPeriod(msg.periodType, msg.periodKey);
    } else {
      fetchAndDrawTotalScore();
    }
  } else if (msg.type === 'minipanel' && msg.score != null) {
    fetchAndDrawMinipanel(Number(msg.score));
  }
});
