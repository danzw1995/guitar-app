import type { Settings } from "../lib/storage";

export interface LabelControlsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

/**
 * 指板显示方式：音名 / 唱名 / 两者，以及唱名用首调还是固定、数字还是 do re mi。
 * 音阶页和游戏页共用同一份 `Settings`，所以两边看到的是同一套设置。
 */
export default function LabelControls({ settings, onChange }: LabelControlsProps) {
  return (
    <>
      <label>
        指板显示
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
          <label>
            唱名体系
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
          <label>
            唱名写法
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
