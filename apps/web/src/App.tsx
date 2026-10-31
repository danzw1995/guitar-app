import { useState } from "react";
import Chords from "./pages/Chords";
import Scales from "./pages/Scales";
import Game from "./pages/Game";

type Tab = "chords" | "scales" | "game";

const TABS: { id: Tab; label: string }[] = [
  { id: "chords", label: "和弦" },
  { id: "scales", label: "音阶" },
  { id: "game", label: "音阶游戏" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("game");

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <h1>Guitar Lab</h1>
            <p>标准调弦 · 音阶与指板练习</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === "chords" && <Chords />}
        {tab === "scales" && <Scales />}
        {tab === "game" && <Game />}
      </main>

      <footer className="app-footer">v0.2.0 · Web-first · 标准调弦</footer>
    </div>
  );
}
