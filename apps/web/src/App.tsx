import { useEffect, useState } from "react";
import Chords from "./pages/Chords";
import Scales from "./pages/Scales";
import Theory from "./pages/Theory";
import Game from "./pages/Game";
import Practice from "./pages/Practice";
import Rhythm from "./pages/Rhythm";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import Tuner from "./pages/Tuner";
import Ear from "./pages/Ear";
import OfflineBanner from "./components/OfflineBanner";
import Onboarding from "./components/Onboarding";
import UpdateToast from "./components/UpdateToast";
import { flashTarget, parseHash, type Tab } from "./lib/nav";
import { useTheme } from "./hooks/useTheme";

const TABS: { id: Tab; label: string }[] = [
  { id: "practice", label: "练习" },
  { id: "rhythm", label: "节奏" },
  { id: "chords", label: "和弦" },
  { id: "scales", label: "音阶" },
  { id: "theory", label: "乐理" },
  { id: "game", label: "音阶游戏" },
  { id: "tuner", label: "调音" },
  { id: "ear", label: "扒谱" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
];

// 手机上只放四个最常用的入口，其余收进「更多」——八个 Tab 排一行在 390 的屏上点不准
const PRIMARY: Tab[] = ["practice", "rhythm", "theory", "stats"];
const SECONDARY: Tab[] = ["chords", "scales", "game", "tuner", "ear", "settings"];

// 「更多」里分成三组：光看「和弦 / 音阶 / 调音」这些名字，不知道点进去是干什么的（v0.135.0）
interface MoreItem {
  id: Tab;
  hint: string;
}

interface MoreGroup {
  title: string;
  hint: string;
  items: MoreItem[];
}

const MORE_GROUPS: MoreGroup[] = [
  {
    title: "练琴",
    hint: "按弦、把位、反应",
    items: [
      { id: "chords", hint: "和弦库 · 转换训练" },
      { id: "scales", hint: "把位 · 五种形状" },
      { id: "game", hint: "限时找音的位置" },
    ],
  },
  {
    title: "工具",
    hint: "校音、听音",
    items: [
      { id: "tuner", hint: "麦克风校准空弦" },
      { id: "ear", hint: "听辨 · 录音扒谱" },
    ],
  },
  {
    title: "其它",
    hint: "调弦、备份",
    items: [{ id: "settings", hint: "调弦 · 数据备份" }],
  },
];

const labelOf = (id: Tab) => TABS.find((t) => t.id === id)?.label ?? id;

export default function App() {
  // 落地页是「练习」：第一次打开就能看到今日三条，而不是先落在音阶游戏里
  const [tab, setTab] = useState<Tab>("practice");
  const [moreOpen, setMoreOpen] = useState(false);
  // 主题（深 / 浅 / 跟随系统）落在 <html data-theme> 上
  useTheme();

  // 「更多」是个浮层：Esc 关掉，打开时把焦点放进去
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const first = document.querySelector<HTMLButtonElement>(".more-grid button");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const go = (id: Tab) => {
    setTab(id);
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
    // 让地址栏跟上（replaceState 不产生历史记录，后退键不会被 Tab 切换塞满）
    window.history.replaceState(null, "", `#${id}`);
  };

  // 深链接：`#rhythm/drill-rd-01` 这种地址进来（或前进后退）时切到那个页面并滚到那一条
  useEffect(() => {
    const apply = () => {
      const route = parseHash(window.location.hash);
      if (!route) return;
      setTab(route.tab);
      setMoreOpen(false);
      if (route.target) {
        // 等这一页渲染完再滚（页面是条件渲染，切换后的第一帧还没有目标元素）
        window.setTimeout(() => flashTarget(route.target as string), 90);
      } else {
        window.scrollTo({ top: 0 });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <div>
            <h1>Guitar Lab</h1>
            <p>标准调弦 · 音阶与指板练习</p>
          </div>
        </div>
        <nav className="tabs" aria-label="主导航">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "tab active" : "tab"}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <OfflineBanner />

      <main className="app-main" id="main" tabIndex={-1}>
        {tab === "chords" && <Chords />}
        {tab === "scales" && <Scales />}
        {tab === "theory" && <Theory />}
        {tab === "game" && <Game />}
        {tab === "practice" && <Practice />}
        {tab === "rhythm" && <Rhythm />}
        {tab === "tuner" && <Tuner />}
        {tab === "ear" && <Ear />}
        {tab === "stats" && <Stats />}
        {tab === "settings" && <Settings />}
      </main>

      <footer className="app-footer">v{__APP_VERSION__} · Web-first · 标准调弦</footer>

      {/* 手机底部导航（≤900px 才显示）：四个常用入口 + 更多 */}
      <nav className="bottom-nav" aria-label="主导航（手机）">
        {PRIMARY.map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "bottom-tab active" : "bottom-tab"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            {labelOf(id)}
          </button>
        ))}
        <button
          type="button"
          className={SECONDARY.includes(tab) || moreOpen ? "bottom-tab active" : "bottom-tab"}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen((open) => !open)}
        >
          更多
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet" role="dialog" aria-label="更多入口">
          <button
            type="button"
            className="more-backdrop"
            aria-label="关掉"
            onClick={() => setMoreOpen(false)}
          />
          <div className="more-panel">
            <div className="more-head">
              <h2>更多</h2>
              <button type="button" className="btn-quiet" onClick={() => setMoreOpen(false)}>
                关掉
              </button>
            </div>
            <div className="more-groups">
              {MORE_GROUPS.map((group) => (
                <section className="more-group" key={group.title} aria-label={group.title}>
                  <h3 className="more-group-title">
                    {group.title}
                    <span className="more-group-hint">{group.hint}</span>
                  </h3>
                  <div className="more-grid">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={tab === item.id ? "more-item active" : "more-item"}
                        aria-current={tab === item.id ? "page" : undefined}
                        onClick={() => go(item.id)}
                      >
                        <span className="more-item-label">{labelOf(item.id)}</span>
                        <span className="more-item-hint">{item.hint}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <UpdateToast />
      <Onboarding onFinish={() => setTab("practice")} />
    </div>
  );
}
