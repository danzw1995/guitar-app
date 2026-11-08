# 版本与协作约定

## 版本号

SemVer：`MAJOR.MINOR.PATCH`

- MAJOR：不兼容的接口/数据变更
- MINOR：向下兼容的新功能
- PATCH：修 bug、文案、样式

发版按内容定级，不强制每个版本都带新功能：只有修复时发 PATCH（v0.2.1–v0.2.3 都是这样）。

## 谁跟着谁涨

| 包 | 版本号 | 说明 |
|---|---|---|
| 根 `package.json` | 产品版本 | 与 git tag 一致 |
| `apps/web` | 产品版本 | 跟随根 |
| `packages/core` | 独立 | 只在自己的 API 变化时动；新增导出算 MINOR |
| `plugins/dsh-guitar` | 独立 | 同上；插件与产品发版节奏不同，改插件才动 |

当前：产品 `0.19.0`，core `0.15.0`，插件 `0.5.1`（v0.19.0 给 core 加了 `strumTab`（按音位排谱），算 MINOR）。

## 一次发版的流程

1. 功能提交到 `main`。
2. 更新 `CHANGELOG.md`：把 `Unreleased` 的内容移到新版本号下，写日期。
3. 更新根 `package.json` 与 `apps/web` 的版本号；`packages/core` 只在自己的 API 变了时升。
4. 提交：`chore(release): v0.4.1`。
5. 打 annotated tag：`git tag -a v0.4.1 -m "v0.4.1"`。
6. 推送：`git push origin main --tags`（本仓库目前没配 remote，推送前先 `git remote add`）。

## 提交信息

Conventional Commits：

```
feat(core): 增加五声音阶
fix(web): 修复计时器在后台漂移
docs: 更新版本流程
chore(release): v0.4.1
```

scope：`core` / `web` / `docs` / `repo`。

## 追溯

- 每个版本一个 tag；`git log v0.2.4..v0.3.0` 可看该版本全部提交。
- `CHANGELOG.md` 按版本记录“做了什么”，tag 指向对应提交。
- 破坏性变更在提交 body 里写 `BREAKING CHANGE:`。
