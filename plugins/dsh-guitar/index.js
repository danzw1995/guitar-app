/**
 * Host 半。
 *
 * v0.5.0 先只交付 Client 面板（client.js），Host 侧不注册任何东西：
 * `apply` 必须存在，否则 bundle 里这一行会是一个没有插件形状的模块。
 *
 * 下一步（确认沙箱里的模块解析后）在这里用全局 `harness.defineTool` +
 * `ctx.tools.register` 暴露 guitar.lookupChord / guitar.generatePuzzle。
 */
export function apply() {}
