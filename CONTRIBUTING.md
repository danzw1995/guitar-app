# 参与开发

## 环境

- Node 22+（本机 26）
- pnpm 9+：`npm install -g pnpm`
- Windows / macOS 均可

## 安装与运行

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test       # core 测试（9 个）
pnpm build      # apps/web/dist
pnpm demo L01   # 终端打印一关
```

## 目录

```
packages/core/   纯 TS 领域核心（理论 / 出题 / 判定 / 数据）
apps/web/        React + Vite 前端
docs/            产品、架构、规则、UX、路线图
```

## 约定

- **core 不碰 DOM / Node API**。需要文件读取的放 `levels.ts`，且不从 `index.ts` 导出。
- 新调式/音阶先加 `theory.ts`，再补 `test/core.test.ts`。
- UI 状态尽量留在页面内；跨会话数据才进 localStorage。
- 新增 JSON 必须 **UTF-8 无 BOM**（PowerShell 5.1 的 `Set-Content -Encoding utf8` 会带 BOM，Vite 会报错）。
- 提交信息用 Conventional Commits，scope：`core` / `web` / `docs` / `repo`。

## 测试

```bash
pnpm test
```

覆盖：调弦、调号拼写、音高类、目标格、出题、判定三态、40 关完整性。

UI 目前没有自动化测试；改 UI 后至少手动过一遍：和弦页、音阶页、L01、L40、提交与重来。

## 发版

1. 更新 `CHANGELOG.md`：`Unreleased` 移到新版本，写日期。
2. 改 `package.json`（根 + `apps/web`）版本。
3. `git commit -m "chore(release): vX.Y.Z"`。
4. `git tag -a vX.Y.Z -m "vX.Y.Z"`。
5. `git push origin main --tags`。

细节见 `docs/versioning.md`。

## 已知环境限制

- 当前 DSH 沙箱禁止 esbuild 启动子进程，`pnpm build` 可能失败；用 `pnpm dev` + `tsc --noEmit` 验证。
- `pnpm dev` 首次启动若报 PostCSS/JSON 解析错误，检查 `package.json` 是否带 BOM。
