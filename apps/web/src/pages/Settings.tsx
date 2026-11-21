import { useRef, useState } from "react";
import LabelControls from "../components/LabelControls";
import Onboarding, { resetOnboarding } from "../components/Onboarding";
import {
  applyBackup,
  backupFileName,
  buildBackup,
  mergeBackup,
  parseBackup,
} from "../lib/backup";
import {
  clearProgress,
  loadSettings,
  saveSettings,
  type Settings as AppSettings,
  type ThemeMode,
} from "../lib/storage";
import { THEME_EVENT } from "../hooks/useTheme";

const THEMES: { id: ThemeMode; label: string; hint: string }[] = [
  { id: "auto", label: "跟随系统", hint: "系统切深色 / 浅色时跟着变" },
  { id: "dark", label: "深色", hint: "一直是这块深色" },
  { id: "light", label: "浅色", hint: "白底，白天在亮处看得清" },
];

/** 全局设置：一次改完，音阶页 / 游戏页都跟着变。 */
export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [cleared, setCleared] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [backupNote, setBackupNote] = useState("");
  const [backupError, setBackupError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function update(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
  }

  /** 换主题：存设置之后让 `useTheme` 重读一次，`<html data-theme>` 立刻跟变。 */
  function pickTheme(theme: ThemeMode) {
    update({ ...settings, theme });
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  function replayGuide() {
    resetOnboarding();
    setShowGuide(true);
  }

  function resetAll() {
    if (!window.confirm("清空 40 关进度、每日挑战记录和最快成绩？这个操作不可撤销。")) return;
    clearProgress();
    setCleared(true);
  }

  /** 导出：把本机 `guitar.*` 打包成一个 JSON 下载下来。 */
  function exportBackup() {
    setBackupError("");
    try {
      const file = buildBackup();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName();
      link.click();
      URL.revokeObjectURL(url);
      const keys = Object.keys(file.data).length;
      setBackupNote(`已导出 ${backupFileName()}（${keys} 类数据）。`);
    } catch (error) {
      setBackupNote("");
      setBackupError(error instanceof Error ? error.message : "导出失败");
    }
  }

  /** 导入：读文件 → 合并（留更好的成绩）→ 写回 → 刷新页面。 */
  async function importBackup(file: File) {
    setBackupNote("");
    setBackupError("");
    try {
      const text = await file.text();
      const incoming = parseBackup(text);
      const { next, summary } = mergeBackup(buildBackup(), incoming);
      applyBackup(next);
      setBackupNote(
        `已合并：${summary.levels} 关进度、${summary.practiceDays} 天打卡、${summary.rhythmItems} 条跟练、${summary.scores} 条我的谱。页面马上刷新…`,
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "导入失败");
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>设置</h2>
        <p>这些配置对所有页面生效，保存于本机。</p>
      </div>

      <div className="settings">
        <LabelControls settings={settings} onChange={update} />

        <div className="settings-row theme-row">
          <span>
            主题
            <span className="muted"> · 深色 / 浅色 / 跟随系统，整个 app 一起换</span>
          </span>
          <span className="theme-chips" role="group" aria-label="选择主题">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${settings.theme === item.id ? " on" : ""}`}
                aria-pressed={settings.theme === item.id}
                title={item.hint}
                onClick={() => pickTheme(item.id)}
              >
                {item.label}
              </button>
            ))}
          </span>
        </div>

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
          <span className="muted">三步引导只在第一次打开时出现一次，可以在这里再看。</span>
          <button className="btn ghost" onClick={replayGuide}>
            再看一遍新手引导
          </button>
        </div>

        <div className="settings-row backup-row">
          <span>
            数据备份
            <span className="muted">
              {" "}
              · 导出成一个 JSON；导入时按记录合并，成绩留更好的那个，不会覆盖掉更好的成绩
            </span>
          </span>
          <span className="backup-actions">
            <button className="btn ghost" onClick={exportBackup}>
              导出备份
            </button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              导入备份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              aria-label="选择备份文件"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importBackup(file);
              }}
            />
          </span>
        </div>

        {backupNote && (
          <p className="backup-note" role="status">
            {backupNote}
          </p>
        )}
        {backupError && (
          <p className="backup-note error" role="alert">
            {backupError}
          </p>
        )}

        <div className="settings-row">
          <span className="muted">清空 40 关进度、每日挑战记录与最快成绩（只影响本机）。</span>
          <button className="btn ghost" onClick={resetAll}>
            重置进度
          </button>
        </div>

        {cleared && <p className="hint">已清空。回到「音阶游戏」就是从头开始的进度。</p>}
      </div>

      {showGuide && <Onboarding forced onFinish={() => setShowGuide(false)} />}
    </section>
  );
}
