# 参与开发

## 环境

- Node 22+（本机 26）
- pnpm 9+：`npm install -g pnpm`
- Windows / macOS 均可

## 安装与运行

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test       # core 测试（42 个）
pnpm check:styles  # 移动端样式断言（点按 ≥ 40px、iOS 字号 16px、弦名 sticky）
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

覆盖：调弦、调号拼写、音高类、目标格、出题、判定三态、40 关完整性、进度与星级、键盘音名输入、每日挑战与统计。

游戏逻辑（星级、达标时间、解锁、迁移）在 `packages/core/src/progress.ts`，每日出参与统计在 `daily.ts`；
改规则先改那里再补 `test/core.test.ts`。`apps/web/src/lib/storage.ts` 只做读写与迁移，不放规则。

UI 目前没有浏览器测试。`pnpm check:styles` 只做静态断言（解析 `styles.css`，检查移动端点按尺寸、
iOS 表单字号、弦名 sticky），**不渲染页面**，改 UI 后仍要手动过一遍：
和弦页、音阶页、L01、L40、提交与重来、375px 宽度。

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
- **DSH 沙箱以低完整性（Low IL）进程运行**。工作区子目录如果没有同样的 Low 标记，
  `git commit` 会报 `Unable to create '.git/index.lock': Permission denied`，写 `docs/`、`packages/` 也一样。
  本机已修过一次：需要当前用户对目录有完全控制（设标记要 `WRITE_OWNER`），再把 Low 标记递归下去。
  一次性修复（在沙箱外执行，`<SID>` 换成自己的用户 SID）：

  ```powershell
  icacls . /grant:r "*<SID>:(OI)(CI)F" /T
  icacls . /setintegritylevel "(OI)(CI)low" /T
  ```

  撤销：`icacls . /remove:g "*<SID>" /T`，再用同样语法把 `low` 换回 `medium`。
  新增的目录/文件会从父目录继承这两个设置，不用重复执行。
- 沙箱真正生效的写权限是它自己的能力 SID（形如 `S-1-4-…:(OI)(CI)(W,D,DC)`）——
  光靠 `Authenticated Users` 的 `Modify` 和 Low 标记都不够。这个 SID `icacls` 映射不了账户名，
  只能用 .NET 按 SID 授权。
- **pnpm 的 store / 锁目录在工作区外**（`%LOCALAPPDATA%`），默认写不了，`pnpm test` 会报
  `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`。本机已修：给 `pnpm\package-manager-store`、`pnpm-cache`、
  `pnpm-state`、`pnpm-store-operation-locks`、`pnpm-dir-locks` 加了能力 SID 的写权限 + Low 标记（1410 个对象）。
  **没有**动 `pnpm\global`（那里放全局安装的命令，不把写权限交给沙箱）。
  该 SID 由沙箱分配，换机器或沙箱版本变化后可能要重来一次；重新授权用：

  ```powershell
  $sid = [System.Security.Principal.SecurityIdentifier]::new('S-1-4-<沙箱 SID>')
  $rights = [System.Security.AccessControl.FileSystemRights]::Write -bor
            [System.Security.AccessControl.FileSystemRights]::Delete -bor
            [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles
  $allow  = [System.Security.AccessControl.AccessControlType]::Allow
  $inh    = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
            [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  # 对目标目录及其子项：Get-Acl -> AddAccessRule($sid,$rights,$inh) -> Set-Acl
  ```

  撤销：对同样的路径用 `RemoveAccessRule` 删掉这条 SID 的权限项，再
  `icacls <dir> /setintegritylevel "(OI)(CI)medium" /T`。
  临时绕法（不改权限）：`node packages/core/test/core.test.ts`。
- **`pnpm dev` 报 `[BABEL] .../main.tsx: missing ) after argument list`，但 `tsc` 正常**：
  不是代码问题，是 `node_modules` 里某个依赖文件被写坏了。本机遇到过
  `@babel/parser/lib/index.js` 混进 2 个坏字节（`chunkSta` 后多出一个 `0xF2`），
  Babel 连 `const a = 1` 都解析不了。`pnpm store status` 会误报「untouched」，删包重装也没用。
  修法是按 shasum 校验后从 registry 重新解出该包：

  ```powershell
  # 从 registry 拿 tarball，校验 shasum 后覆盖到对应目录
  tar -xzf <pkg-version>.tgz -C node_modules\.pnpm\<pkg>@<ver>\node_modules\<pkg> --strip-components=1
  ```

  验证：`node -e "require('<...>/@babel/core').transformSync('const a = 1')"` 能跑通即恢复。
  排查同类问题：扫描 `node_modules` 下 `.js/.json/.ts` 的 UTF-8 合法性（本机扫过 1769 个文件，
  只有这一个坏）。
