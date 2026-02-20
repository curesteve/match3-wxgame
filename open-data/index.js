/**
 * 开放数据域入口：好友排行榜（积分 / 关卡 / 星级）
 * 微信要求 openDataContext 目录下提供 index.js 作为入口。
 */
var sharedCanvas = wx.getSharedCanvas();
var ctx = sharedCanvas.getContext('2d');
var RANK_KEYS = ['score', 'level', 'stars'];
var list = [];
var loading = true;
var errMsg = '';
var currentRankType = 'score';
var FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif';
if (typeof wx !== 'undefined' && wx.loadFont) {
  try {
    var loaded = wx.loadFont('fonts/cartoon.ttf') || wx.loadFont('fonts/ZCOOLKuaiLe-Regular.ttf');
    if (loaded && typeof loaded === 'string') FONT_FAMILY = loaded;
  } catch (e) {}
}

function getSortValue(item) {
  if (currentRankType === 'level') return item.level != null ? item.level : 0;
  if (currentRankType === 'stars') return item.stars != null ? item.stars : 0;
  return item.score != null ? item.score : 0;
}

function getDisplayValue(item) {
  if (currentRankType === 'level') return String(item.level != null ? item.level : 0);
  if (currentRankType === 'stars') return String(item.stars != null ? item.stars : 0);
  return String(item.score != null ? item.score : 0);
}

function getTitle() {
  if (currentRankType === 'level') return '好友关卡排行';
  if (currentRankType === 'stars') return '好友星级排行';
  return '好友积分排行';
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
  ctx.fillText(getTitle(), w / 2, 24);
  if (list.length === 0) {
    ctx.fillText('暂无好友数据', w / 2, h / 2);
    return;
  }
  var lineH = 32;
  var y = 44;
  for (var i = 0; i < list.length && y < h - 20; i++) {
    var item = list[i];
    var rank = i + 1;
    var name = (item.nickName || item.nickname || '') ? String(item.nickName || item.nickname).slice(0, 8) : ('玩家' + rank);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(rank + '. ' + name, 16, y + 20);
    ctx.textAlign = 'right';
    ctx.fillText(getDisplayValue(item), w - 16, y + 20);
    ctx.textAlign = 'center';
    y += lineH;
  }
}

function fetchAndDraw(rankType) {
  currentRankType = rankType === 'level' || rankType === 'stars' ? rankType : 'score';
  loading = true;
  errMsg = '';
  list = [];
  drawRank();
  wx.getFriendCloudStorage({
    keyList: RANK_KEYS,
    success: function (res) {
      loading = false;
      var data = res.data || [];
      list = data.map(function (user) {
        var score = 0, level = 0, stars = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          var k = kvList[j].key || kvList[j].keyName;
          var v = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
          if (k === 'score') score = v;
          else if (k === 'level') level = v;
          else if (k === 'stars') stars = v;
        }
        return { nickName: user.nickname || user.nickName, score: score, level: level, stars: stars, openid: user.openid };
      });
      list.sort(function (a, b) { return getSortValue(b) - getSortValue(a); });
      drawRank();
    },
    fail: function (err) {
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
    keyList: RANK_KEYS,
    success: function (res) {
      finish();
      loading = false;
      var data = res.data || [];
      var list = data.map(function (user) {
        var score = 0, level = 0, stars = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          var k = kvList[j].key || kvList[j].keyName;
          var v = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
          if (k === 'score') score = v;
          else if (k === 'level') level = v;
          else if (k === 'stars') stars = v;
        }
        return { score: score, level: level, stars: stars };
      });
      list.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      var rank = 1;
      var gapAbove = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].score > myScore) {
          rank++;
          if (gapAbove == null) gapAbove = list[i].score;
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
  if (msg.type === 'refresh') {
    fetchAndDraw(msg.rankType || 'score');
  } else if (msg.type === 'minipanel' && msg.score != null) {
    fetchAndDrawMinipanel(Number(msg.score));
  }
});
