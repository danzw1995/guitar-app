import { useMemo, useState } from "react";
import {
  LEVEL_LABEL,
  RHYTHM_DRILLS,
  SONG_SNIPPETS,
  STRUM_LIBRARY,
  type Level,
} from "@guitar/core";
import Metronome from "../components/Metronome";
import TabDiagram from "../components/TabDiagram";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

/**
 * 节奏专项：把「时值不稳」这件事拆开练。
 *
 * 三块内容对应三种练法：
 * 1. 时值练习——单音上练节奏，不受左手干扰；
 * 2. 扫弦节奏型——手上真正的伴奏动作，带数拍词；
 * 3. 风格片段——连着和弦弹，接近真实曲子的样子。
 */
export default function Rhythm() {
  const [level, setLevel] = useState<Level | 0>(0);

  const drills = useMemo(
    () => RHYTHM_DRILLS.filter((drill) => level === 0 || drill.level === level),
    [level],
  );
  const patterns = useMemo(
    () => STRUM_LIBRARY.filter((item) => level === 0 || item.level === level),
    [level],
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>节奏专项</h2>
        <p>
          时值不稳、三连音发虚、八分十六分切换乱——这些都能单独练。
          每条都带六线谱和数拍词：先跟着念，再跟着节拍器弹。
        </p>
      </div>

      <div className="lesson-buttons">
        <button
          type="button"
          className={level === 0 ? "chip on" : "chip"}
          aria-pressed={level === 0}
          onClick={() => setLevel(0)}
        >
          全部
        </button>
        {LEVELS.map((item) => (
          <button
            key={item}
            type="button"
            className={level === item ? "chip on" : "chip"}
            aria-pressed={level === item}
            onClick={() => setLevel(item)}
          >
            {LEVEL_LABEL[item]}
          </button>
        ))}
      </div>

      <details className="practice-metronome" open>
        <summary>节拍器（先开起来，再看谱）</summary>
        <Metronome />
      </details>

      <h3 className="practice-h3">
        时值练习
        <span className="practice-h3-hint">先跟着数拍词念，再上琴</span>
      </h3>
      <div className="drill-grid">
        {drills.map((drill) => (
          <article key={drill.id} className="drill-card">
            <header className="drill-head">
              <h4>{drill.name}</h4>
              <span className={`level-badge lv${drill.level}`}>{LEVEL_LABEL[drill.level]}</span>
            </header>
            <p className="rhythm-focus">{drill.focus}</p>
            <p className="rhythm-count">
              数：<b>{drill.count}</b>
              <span className="rhythm-bpm">
                {drill.bpm[0]}–{drill.bpm[1]} BPM
              </span>
            </p>
            <TabDiagram tab={drill.tab} />
            <details className="pb-more">
              <summary>怎么练 · 验收</summary>
              <ol className="pb-steps">
                {drill.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ol>
              <p className="pb-line">
                <b>验收</b>：{drill.pass}
              </p>
            </details>
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        扫弦节奏型
        <span className="practice-h3-hint">手上真正要做的动作，箭头是方向</span>
      </h3>
      <div className="drill-grid">
        {patterns.map((pattern) => (
          <article key={pattern.id} className="drill-card">
            <header className="drill-head">
              <h4>{pattern.name}</h4>
              <span className={`level-badge lv${pattern.level}`}>
                {LEVEL_LABEL[pattern.level]}
              </span>
            </header>
            <p className="rhythm-count">
              数：<b>{pattern.count}</b>
              <span className="rhythm-bpm">{pattern.chord} 和弦</span>
            </p>
            <TabDiagram tab={pattern.tab} />
            <p className="pb-line">{pattern.tip}</p>
          </article>
        ))}
      </div>

      <h3 className="practice-h3">
        风格片段
        <span className="practice-h3-hint">连着和弦弹，最接近真实曲子的样子</span>
      </h3>
      <div className="drill-grid">
        {SONG_SNIPPETS.map((snippet) => (
          <article key={snippet.id} className="drill-card">
            <header className="drill-head">
              <h4>{snippet.name}</h4>
              <span className={`level-badge lv${snippet.level}`}>
                {LEVEL_LABEL[snippet.level]}
              </span>
            </header>
            <p className="rhythm-focus">{snippet.style}</p>
            <p className="rhythm-count">
              和弦：<b>{snippet.chords.join(" → ")}</b>
              <span className="rhythm-bpm">
                {snippet.bpm[0]}–{snippet.bpm[1]} BPM
              </span>
            </p>
            <TabDiagram tab={snippet.tab} />
            <p className="pb-line">{snippet.tip}</p>
          </article>
        ))}
      </div>

      <p className="practice-foot">
        时值练不稳时只有一个办法：**把 BPM 降到能听见每一拍**，稳了再加 5。
        跟着这套顺序走：数拍词 → 60 BPM 单音 → 加到 80 → 再换到和弦上。
      </p>
    </section>
  );
}
