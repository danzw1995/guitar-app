import { useEffect, useState } from "react";
import Chords from "./pages/Chords";
import Scales from "./pages/Scales";
import Theory from "./pages/Theory";
import Game from "./pages/Game";
import Practice from "./pages/Practice";
import Rhythm from "./pages/Rhythm";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import OfflineBanner from "./components/OfflineBanner";
import Onboarding from "./components/Onboarding";
import UpdateToast from "./components/UpdateToast";
import { flashTarget, parseHash, type Tab } from "./lib/nav";

const TABS: { id: Tab; label: string }[] = [
  { id: "practice", label: "练习" },
  { id: "rhythm", label: "节奏" },
  { id: "chords", label: "和弦" },
  { id: "scales", label: "音阶" },
  { id: "theory", label: "乐理" },
  { id: "game", label: "音阶游戏" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
];

// 手机上只放四个最常用的入口，其余收进「更多」——八个 Tab 排一行在 390 的屏上点不准
const PRIMARY: Tab[] = ["practice", "rhythm", "theory", "stats"];
const SECONDARY: Tab[] = ["chords", "scales", "game", "settings"];

const labelOf = (id: Tab) => TABS.find((t) => t.id === id)?.label ?? id;

export default function App() {
  // 落地页是「练习」：第一次打开就能看到今日三条，而不是先落在音阶游戏里
  const [tab, setTab] = useState<Tab>("practice");
  const [moreOpen, setMoreOpen] = useState(false);

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
            <div className="more-grid">
              {SECONDARY.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? "more-item active" : "more-item"}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => go(id)}
                >
                  {labelOf(id)}
                </button>
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
