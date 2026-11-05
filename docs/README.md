# 文档索引

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [handoff.md](handoff.md) | 当前状态、已知问题、下一步、新会话开场白 | **第一次进入项目** |
| [product.md](product.md) | 用户、问题、范围、非目标、指标 | 做需求判断 |
| [architecture.md](architecture.md) | 分层、边界、数据流、跨端、技术决策 | 改结构 / 加平台 |
| [game-rules.md](game-rules.md) | 调弦、拼写、出题、判定、难度、40 关 | 改 core / 改玩法 |
| [ux.md](ux.md) | 页面、指板方向、颜色、交互、响应式 | 改 UI |
| [practice.md](practice.md) | 练习计划设计稿：练什么、怎么练、六个阶段、练习页 | 做练习 / 节奏功能 |
| [roadmap.md](roadmap.md) | v0.3 → v1.0 的任务、验收、风险 | 排期 / 接任务 |
| [versioning.md](versioning.md) | SemVer、tag、CHANGELOG、提交规范 | 发版 |

## 推荐阅读顺序

1. `handoff.md`
2. `architecture.md`
3. `roadmap.md`
4. 按任务读 `game-rules.md` 或 `ux.md`

## 维护规则

- 代码行为变了，对应文档必须同一次提交更新。
- 路线图任务完成 -> 勾掉/移到 CHANGELOG；不要留“已完成但没记”。
- 新决策写进 `architecture.md` 的“关键技术决策”，不要只留在聊天里。
