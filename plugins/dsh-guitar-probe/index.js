/**
 * 探针插件：只回答一个问题——「安装成包的 Host 半能不能 import 仓库里的模块」。
 *
 * - 能 import：这一行在插件页是 active（控制台还会打印一行 `[guitar-probe] import ok`）；
 * - 不能：这一行显示 failed，错误就是原因（通常是 ERR_MODULE_NOT_FOUND，或沙箱不允许跨包路径）。
 *
 * 结论出来之后这个包就可以删掉；如果通了，把这里的 import 搬进 dsh-guitar 的 index.js
 * 去注册 `guitar.lookupChord` / `guitar.generatePuzzle`。
 */
import { CHORDS, KEYS, SCALES } from "../../packages/core/dist/index.js";

export function apply() {
  console.log(
    `[guitar-probe] import ok — chords=${CHORDS.length} keys=${KEYS.length} scales=${SCALES.length}`,
  );
}
