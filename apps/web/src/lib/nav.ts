/**
 * 页面之间的小路由：只认 `#tab` 和 `#tab/elementId` 两种写法。
 *
 * 之所以不用 react-router：全站就八个 Tab，需要跳转的地方只有乐理课底部的
 * 「去练这条」——它要说清「去哪个页面、哪一条」。一个 hash 就够了，
 * 刷新和分享也还能用（手机上从别处点回来不会丢位置）。
 */

export type Tab =
  | "chords"
  | "scales"
  | "theory"
  | "game"
  | "practice"
  | "rhythm"
  | "stats"
  | "settings";

export const TAB_IDS: Tab[] = [
  "practice",
  "rhythm",
  "chords",
  "scales",
  "theory",
  "game",
  "stats",
  "settings",
];

export interface Route {
  tab: Tab;
  /** 目标元素的 id，比如 `drill-rd-01`；没有就是只切页面 */
  target?: string;
}

export function isTab(value: string): value is Tab {
  return (TAB_IDS as string[]).includes(value);
}

/** `#rhythm/drill-rd-01` → `{ tab: "rhythm", target: "drill-rd-01" }`；认不出返回 null */
export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, "").trim();
  if (raw === "") return null;
  const [head, ...rest] = raw.split("/");
  if (!isTab(head)) return null;
  const target = rest.join("/").trim();
  return target === "" ? { tab: head } : { tab: head, target };
}

/** 切页面 + 可选地滚到某一条；写进 hash，浏览器后退键也能用 */
export function goTo(tab: Tab, target?: string): void {
  const next = target ? `#${tab}/${target}` : `#${tab}`;
  if (window.location.hash === next) {
    // 同一个位置再点一次：hash 不变就不会触发 hashchange，手动滚一下
    if (target) flashTarget(target);
    return;
  }
  window.location.hash = next;
}

/**
 * 把目标滚到眼前，并闪一下边框。目标可能在收起来的块里（节奏页六块默认收起），
 * 所以先找最近的 `.block-closed`，点它的开关展开，再滚。
 */
export function flashTarget(target: string, attempt = 0): void {
  const el = document.getElementById(target);
  if (!el) {
    // 目标可能还没渲染出来（切页面、切阶段之后要等一帧），最多再等 8 次
    if (attempt < 8) window.setTimeout(() => flashTarget(target, attempt + 1), 80);
    return;
  }

  const closed = el.closest(".block-closed");
  if (closed) {
    const toggle = closed.previousElementSibling?.querySelector<HTMLButtonElement>(".block-toggle");
    toggle?.click();
  }

  window.requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    window.setTimeout(() => el.classList.remove("flash"), 1800);
  });
}
