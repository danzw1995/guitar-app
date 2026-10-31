# 版本与协作约定

## 版本号

SemVer：`MAJOR.MINOR.PATCH`

- MAJOR：不兼容的接口/数据变更
- MINOR：向下兼容的新功能（一次发版至少一个 MINOR）
- PATCH：修 bug、文案、样式

当前：`0.2.0`。

## 一次发版的流程

1. 功能提交到 `main`。
2. 更新 `CHANGELOG.md`：把 `Unreleased` 的内容移到新版本号下，写日期。
3. 更新根 `package.json` 与相关子包版本号。
4. 提交：`chore(release): v0.2.0`。
5. 打 annotated tag：`git tag -a v0.2.0 -m "v0.2.0"`。
6. 推送：`git push origin main --tags`。

## 提交信息

Conventional Commits：

```
feat(core): 增加五声音阶
fix(web): 修复计时器在后台漂移
docs: 更新版本流程
chore(release): v0.2.0
```

scope：`core` / `web` / `docs` / `repo`。

## 追溯

- 每个版本一个 tag；`git log v0.1.0..v0.2.0` 可看该版本全部提交。
- `CHANGELOG.md` 按版本记录“做了什么”，tag 指向对应提交。
- 破坏性变更在提交 body 里写 `BREAKING CHANGE:`。
