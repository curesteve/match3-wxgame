/**
 * 开放数据域：好友排行榜
 * 仅可调用 getFriendCloudStorage，将结果绘制到 sharedCanvas，供主域 drawImage 显示。
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

var minipanelMode = false;
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
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
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
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('加载排名…', w / 2, h / 2);
  wx.getFriendCloudStorage({
    keyList: [RANK_KEY],
    success: function (res) {
      loading = false;
      var data = res.data || [];
      var list = data.map(function (user) {
        var score = 0;
        var kvList = user.KVDataList || user.kvDataList || user.data || [];
        for (var j = 0; j < kvList.length; j++) {
          if ((kvList[j].key || kvList[j].keyName) === RANK_KEY) {
            score = parseInt(kvList[j].value || kvList[j].valueStr || '0', 10) || 0;
            break;
          }
        }
        return { score: score };
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
      loading = false;
      drawMinipanel('?', null);
    }
  });
}
wx.onMessage(function (msg) {
  if (msg.type === 'refresh') {
    minipanelMode = false;
    fetchAndDraw();
  } else if (msg.type === 'minipanel' && msg.score != null) {
    minipanelMode = true;
    fetchAndDrawMinipanel(Number(msg.score));
  }
});
