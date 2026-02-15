# 云函数说明

1. 在微信开发者工具中开通云开发，创建环境，记下环境 ID。
2. 在云开发控制台 → 数据库中新建集合：`users`、`game_save`、`game_records`。
3. 在 game.js 中设置 `CLOUD_ENV` 为你的环境 ID。
4. 在开发者工具中右键 `cloudfunctions` 根目录，选择「当前环境」并「上传并部署：所有文件」。
5. 每个云函数需安装依赖：右键该云函数目录 → 「在终端中打开」→ 执行 `npm install wx-server-sdk`（若未自动安装）。
