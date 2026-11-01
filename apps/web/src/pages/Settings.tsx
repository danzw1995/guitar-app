import { useState } from "react";
import LabelControls from "../components/LabelControls";
import {
  clearProgress,
  loadSettings,
  saveSettings,
  type Settings as AppSettings,
} from "../lib/storage";

/** 全局设置：一次改完，音阶页 / 游戏页都跟着变。 */
export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [cleared, setCleared] = useState(false);

  function update(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function resetAll() {
    if (!window.confirm("清空 40 关进度、每日挑战记录和最快成绩？这个操作不可撤销。")) return;
    clearProgress();
    setCleared(true);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>设置</h2>
        <p>这些配置对所有页面生效，保存于本机。</p>
      </div>

      <div className="settings">
        <LabelControls settings={settings} onChange={update} />

        <label className="settings-row">
          <span>
            严格拼写
            <span className="muted"> · 拼错算错，拿不到 2 星以上</span>
          </span>
          <input
            type="checkbox"
            checked={settings.strictSpelling}
            onChange={(e) => update({ ...settings, strictSpelling: e.target.checked })}
          />
        </label>

        <div className="settings-row">
          <span className="muted">清空 40 关进度、每日挑战记录与最快成绩（只影响本机）。</span>
          <button className="btn ghost" onClick={resetAll}>
            重置进度
          </button>
        </div>

        {cleared && <p className="hint">已清空。回到「音阶游戏」就是从头开始的进度。</p>}
      </div>
    </section>
  );
}
