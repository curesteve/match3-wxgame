开放数据域 - 好友排行榜
仅拉取同玩好友的托管数据（key: score），按分数降序绘制到 sharedCanvas。
主域通过 getOpenDataContext().canvas 取 sharedCanvas 并 drawImage 显示。
真机测试时请在微信开发者工具/真机中验证：过关后分数上报、排行榜展示是否符合预期；关系链使用符合微信规范。
