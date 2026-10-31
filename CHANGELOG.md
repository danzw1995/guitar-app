# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)；版本时间线以 git tag 为准。

## [Unreleased]

### Planned
- 和弦发声 / 节拍器
- 每日挑战（日期种子）
- 练习记录与统计
- DSH 插件（速查 + 每日一题）
- Tauri（Windows）/ Capacitor（Android）壳

## [0.2.3] - 2026-10-31

### Fixed
- 指板方向改为传统六线谱：**横轴为品、纵轴为弦**（1 弦在上，6 弦在下），0–12 品从左到右。
- 修复 `CHANGELOG.md` 被 PowerShell 以 ANSI 读取后重写导致的乱码。

## [0.2.2] - 2026-10-31

### Fixed
- 移除配置文件中的 UTF-8 BOM，修复 Vite 启动时 PostCSS 配置 JSON 解析错误。

## [0.2.1] - 2026-10-31

### Fixed
- 关卡下拉框只显示当前章节的关卡；现在按 4 个章节分组显示全部 40 关。

## [0.2.0] - 2026-10-31

### Added
- Web 端（React + Vite）：和弦库、音阶指板、40 关音阶游戏。
- 和弦库：C/G/Am/Em/D/A/E/Dm/Fmaj7/F/G7/C7/Bm/B7/Am7/Em7，含指法图与横按。
- 音阶页：12 个调 × 4 种音阶，0–12 品，主音/音阶音高亮，音名开关。
- 游戏页：关卡选择、计时、给定格、音名选择器、提交判定、结果页、localStorage 最佳成绩。
- 三态判定：correct / spelling（音高对拼写错）/ wrong；默认宽松。

## [0.1.0] - 2026-10-31

### Added
- `packages/core`：调号拼写、音阶、指板定位、出题、难度评分、判定。
- 40 关固定关卡数据（4 章 × 10 关），生成脚本与文本演示脚本。
- 9 个核心测试：调弦、拼写、出题、判定、40 关完整性。
