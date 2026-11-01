import type { Settings } from "../lib/storage";

export interface LabelControlsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

/**
 * 指板显示方式：音名 / 唱名 / 两者，以及唱名用首调还是固定、数字还是 do re mi。
 * 这是全局配置，在「设置」页里改，音阶页和游戏页都读同一份。
 */
export default function LabelControls({ settings, onChange }: LabelControlsProps) {
  return (
    <>
      <label className="settings-row">
        <span>
          指板显示
          <span className="muted"> · 圆点里写音名还是唱名</span>
        </span>
        <select
          value={settings.labels}
          onChange={(e) => onChange({ ...settings, labels: e.target.value as Settings["labels"] })}
        >
          <option value="name">音名</option>
          <option value="solfege">唱名</option>
          <option value="both">音名 + 唱名</option>
        </select>
      </label>

      {settings.labels !== "name" && (
        <>
          <label className="settings-row">
            <span>
              唱名体系
              <span className="muted"> · 首调跟着调走，固定永远 C=do</span>
            </span>
            <select
              value={settings.solfegeSystem}
              onChange={(e) =>
                onChange({ ...settings, solfegeSystem: e.target.value as Settings["solfegeSystem"] })
              }
            >
              <option value="movable">首调（当前调 1=do）</option>
              <option value="fixed">固定（C=do）</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              唱名写法
              <span className="muted"> · 数字或 do re mi，变化音带升/降</span>
            </span>
            <select
              value={settings.solfegeStyle}
              onChange={(e) =>
                onChange({ ...settings, solfegeStyle: e.target.value as Settings["solfegeStyle"] })
              }
            >
              <option value="number">数字 1 2 3</option>
              <option value="syllable">do re mi</option>
            </select>
          </label>
        </>
      )}
    </>
  );
}
