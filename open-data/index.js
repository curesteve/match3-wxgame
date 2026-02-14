/**
 * 开放数据域入口：好友排行榜
 * 微信要求 openDataContext 目录下提供 index.js 作为入口。
 */
var sharedCanvas = wx.getSharedCanvas();
var ctx = sharedCanvas.getContext('2d');
var RANK_KEY = 'score';
var list = [];
var loading = true;
var errMsg = '';

function drawRank() {
  var w = sharedCanvas.width || 300;
  var h = sharedCanvas.height || 400;
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eee';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  if (loading) {
    ctx.fillText('加载中…', w / 2, h / 2);
    return;
  }
  if (errMsg) {
    ctx.fillText(errMsg, w / 2, h / 2);
    return;
  }
  ctx.fillText('好友排行', w / 2, 24);
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
    var sc = item.score != null ? item.score : 0;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(rank + '. ' + name, 16, y + 20);
    ctx.textAlign = 'right';
    ctx.fillText(String(sc), w - 16, y + 20);
    ctx.textAlign = 'center';
    y += lineH;
  }
}

function fetchAndDraw() {
  loading = true;
  errMsg = '';
  list = [];
  drawRank();
  wx.getFriendCloudStorage({
    keyList: [RANK_KEY],
    success: function (res) {
      loading = false;
      var data = res.data || [];
      list = data.map(function (user) {
        var score = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          if ((kvList[j].key || kvList[j].keyName) === RANK_KEY) {
            score = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
            break;
          }
        }
        return { nickName: user.nickname || user.nickName, score: score, openid: user.openid };
      });
      list.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      drawRank();
    },
    fail: function (err) {
      loading = false;
      errMsg = '获取失败';
      drawRank();
    }
  });
}

wx.onMessage(function (msg) {
  if (msg.type === 'refresh') {
    fetchAndDraw();
  }
});
