import { useState } from "react";
import Chords from "./pages/Chords";
import Scales from "./pages/Scales";
import Game from "./pages/Game";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import OfflineBanner from "./components/OfflineBanner";
import Onboarding from "./components/Onboarding";

type Tab = "chords" | "scales" | "game" | "stats" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "chords", label: "和弦" },
  { id: "scales", label: "音阶" },
  { id: "game", label: "音阶游戏" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("game");

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
              onClick={() => setTab(t.id)}
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
        {tab === "game" && <Game />}
        {tab === "stats" && <Stats />}
        {tab === "settings" && <Settings />}
      </main>

      <footer className="app-footer">v{__APP_VERSION__} · Web-first · 标准调弦</footer>

      <Onboarding onFinish={() => setTab("game")} />
    </div>
  );
}
