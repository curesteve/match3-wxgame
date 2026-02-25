# 云函数说明

1. 在微信开发者工具中开通云开发，创建环境，记下环境 ID。
2. 在云开发控制台 → 数据库中新建集合：`users`、`game_save`、`game_records`、`global_rank`、`rank_settlements`。
3. 在 game.js 中设置 `CLOUD_ENV` 为你的环境 ID。
4. 在开发者工具中右键 `cloudfunctions` 根目录，选择「当前环境」并「上传并部署：所有文件」。
5. 每个云函数需安装依赖：右键该云函数目录 → 「在终端中打开」→ 执行 `npm install wx-server-sdk`（若未自动安装）。

## 排行榜与结算

- **global_rank**：存储周期榜（periodType、periodKey、userId、totalScore、updatedAt）。建议建复合索引：`periodType` + `periodKey`，以及 `totalScore` 降序以优化查询。
- **rank_settlements**：结算记录（userId、periodType、periodKey、rank、totalScore、goldGranted、claimed、createdAt）。用户下次拉取进度时 progressGet 会领取未领取的金币并标记 claimed。
- **rankSettle**：每日 0:05（服务器时区，建议与北京时间一致）定时触发，结算昨日日榜、上周周榜（周一）、上月月榜（每月 1 日），并写入 rank_settlements。部署后需在云开发控制台确认定时触发器已启用。

## 日/周/月榜奖励与测试

- **奖励档位**（`rankSettle/index.js` 内 `REWARD_TIERS`）：日榜 1 名 100 金、2～3 名 50、4～10 名 20；周榜 1 名 500、2～10 名 200、11～30 名 50；月榜 1 名 1000、2～10 名 500、11～50 名 100。
- **测试步骤**：① 云开发控制台 → 云函数 → `rankSettle` → 测试，应返回 `{ ok: true, day: n, week: n, month: n }`。② 若为 0，在 `global_rank` 中手工加昨日 periodKey（如 `2025-02-22`）、periodType、userId、totalScore 后再测。③ 在 `rank_settlements` 看是否生成记录；用该 userId 进游戏拉进度，`progressGet` 会把金币加进 `game_save` 并标记 claimed。④ 定时 `0 5 0 * * * *` 若为 UTC 则北京 8:05；要北京 0:05 可改为 `0 5 16 * * * *`。
