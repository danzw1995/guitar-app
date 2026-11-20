/**
 * 统计页「最卡的地方」存下的筛选视角（v0.111.0）。
 *
 * 为什么要有这个：级数 + 阶段两排 chip 好是好，但每次想复查「第 5 级在第 1 阶段」
 * 都得点两下；存下来之后一键复原，也比记地址栏那串 `?d=5&s=1` 靠谱。
 *
 * 存的是**整组筛选**（级数 + 阶段），不是单个数——两排是叠着生效的，
 * 只存一半复原出来就不是刚才那个视图了。最多留 5 个，多了没人记得住。
 */

export interface StatsView {
  id: string;
  degree: number | null;
  stage: number | null;
  /** 单独练过几次那排（v0.115.0）：0 = 不限，1 / 3 = 至少那么多次。 */
  spot?: 0 | 1 | 3;
  /** 只看某一套组合（v0.119.0）——存的是组合名，不是 id（记录里的 id 是运行时生成的）。 */
  set?: string;
  /**
   * 存这一套时它的整体短板是哪一级（v0.120.0）。存下来是为了以后翻视角时
   * 还能看到「当时这套卡在第 5 级」——今天的记录过几天就滚出去了，这个数不会。
   */
  weak?: number;
  /** 那一级一共卡了几次（v0.120.0），跟 `weak` 一起来。 */
  weakCount?: number;
  /** 存这一套时练了几次 / 平均多快（v0.121.0）——记录会滚出七天窗口，这两个数留着做参照。 */
  sessions?: number;
  avgBpm?: number;
  /** 系统拼出来的那一串（「第 5 级 · 第 1 阶段」），title 里一直用。 */
  label: string;
  /** 用户自己起的名字（v0.112.0）；没起就用 label 显示。 */
  name?: string;
  addedAt: number;
}

const STORAGE_KEY = "guitar.stats.views.v1";
const MAX_VIEWS = 5;

/** 名字截到 12 个字——chip 里放不下更长的。 */
export function cleanViewName(name: string): string {
  return name.trim().slice(0, 12);
}

/** 一组筛选叫什么：「第 5 级」「第 1 阶段」「单独练过 ≥3 次」「「早课」这套 · 整体卡在第 5 级」。 */
export function viewLabel(
  degree: number | null,
  stage: number | null,
  spot: 0 | 1 | 3 = 0,
  set = "",
  weak = 0,
  sessions = 0,
  avgBpm = 0,
): string {
  const parts: string[] = [];
  if (set) parts.push(`「${set}」这套`);
  if (degree !== null) parts.push(`第 ${degree} 级`);
  if (stage !== null) parts.push(`第 ${stage + 1} 阶段`);
  if (spot > 0) parts.push(`单独练过 ≥${spot} 次`);
  if (weak > 0) parts.push(`整体卡在第 ${weak} 级`);
  if (sessions > 0) parts.push(`练了 ${sessions} 次`);
  if (avgBpm > 0) parts.push(`平均 ${avgBpm} BPM`);
  return parts.length > 0 ? parts.join(" · ") : "全部";
}

/** 只认 0 / 1 / 3 三个值（v0.115.0）。 */
function parseSpot(value: unknown): 0 | 1 | 3 {
  return value === 1 || value === 3 ? value : 0;
}

/** 组合名截到 12 个字（v0.119.0）——和用户起名字一样长。 */
function cleanSet(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 12) : "";
}

/** 级数只认 1–7，其它当没记（v0.120.0）。 */
function parseWeak(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 7
    ? (value as number)
    : 0;
}

function parse(value: unknown): StatsView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: StatsView[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const degree =
      Number.isInteger(record.degree) && (record.degree as number) >= 1 && (record.degree as number) <= 7
        ? (record.degree as number)
        : null;
    const stage =
      Number.isInteger(record.stage) && (record.stage as number) >= 0 && (record.stage as number) <= 5
        ? (record.stage as number)
        : null;
    const spot = parseSpot(record.spot);
    const set = cleanSet(record.set);
    const weak = parseWeak(record.weak);
    const weakCount = weak > 0 && Number.isInteger(record.weakCount) && (record.weakCount as number) > 0
      ? (record.weakCount as number)
      : 0;
    const sessions =
      Number.isInteger(record.sessions) && (record.sessions as number) > 0
        ? (record.sessions as number)
        : 0;
    const avgBpm =
      Number.isInteger(record.avgBpm) && (record.avgBpm as number) > 0
        ? (record.avgBpm as number)
        : 0;
    if (!id || (degree === null && stage === null && spot === 0 && !set)) continue;
    const key = `${set}|${degree ?? "-"}|${stage ?? "-"}|${spot}|${weak}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof record.name === "string" ? cleanViewName(record.name) : "";
    views.push({
      id,
      degree,
      stage,
      spot,
      ...(set ? { set } : {}),
      ...(weak > 0 ? { weak, ...(weakCount > 0 ? { weakCount } : {}) } : {}),
      ...(sessions > 0 ? { sessions, ...(avgBpm > 0 ? { avgBpm } : {}) } : {}),
      label: viewLabel(degree, stage, spot, set, weak, sessions, avgBpm),
      ...(name ? { name } : {}),
      addedAt: typeof record.addedAt === "number" ? record.addedAt : 0,
    });
  }
  return views.sort((a, b) => a.addedAt - b.addedAt).slice(-MAX_VIEWS);
}

function persist(views: StatsView[]): StatsView[] {
  try {
    if (views.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // 存储满了 / 隐私模式：这一次照样生效，只是关掉页面就没了
  }
  return views;
}

export function loadViews(): StatsView[] {
  try {
    return parse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** 存一组筛选；同一组已经存过就原样返回（不重复存）。可以顺手起个名字（v0.112.0）。 */
export function saveView(
  degree: number | null,
  stage: number | null,
  spot: 0 | 1 | 3 = 0,
  name = "",
  set = "",
  weak = 0,
  weakCount = 0,
  sessions = 0,
  avgBpm = 0,
): StatsView[] {
  const cleanSetName = cleanSet(set);
  if (degree === null && stage === null && spot === 0 && !cleanSetName) return loadViews();
  const cleanWeak = parseWeak(weak);
  const views = loadViews();
  const exists = views.find(
    (view) =>
      view.degree === degree &&
      view.stage === stage &&
      (view.spot ?? 0) === spot &&
      (view.set ?? "") === cleanSetName &&
      (view.weak ?? 0) === cleanWeak,
  );
  if (exists) return views;
  const clean = cleanViewName(name);
  const next: StatsView = {
    id: `v-${Date.now().toString(36)}`,
    degree,
    stage,
    spot,
    ...(cleanSetName ? { set: cleanSetName } : {}),
    ...(cleanWeak > 0
      ? { weak: cleanWeak, ...(weakCount > 0 ? { weakCount } : {}) }
      : {}),
    ...(sessions > 0 ? { sessions, ...(avgBpm > 0 ? { avgBpm } : {}) } : {}),
    label: viewLabel(degree, stage, spot, cleanSetName, cleanWeak, sessions, avgBpm),
    ...(clean ? { name: clean } : {}),
    addedAt: Date.now(),
  };
  return persist([...views, next].slice(-MAX_VIEWS));
}

/** 改个名字（v0.112.0）；空名字就当没改。 */
export function renameView(id: string, name: string): StatsView[] {
  const clean = cleanViewName(name);
  if (!clean) return loadViews();
  return persist(loadViews().map((view) => (view.id === id ? { ...view, name: clean } : view)));
}

/**
 * 用了一次就把这枚胶囊挪到最后（v0.113.0）——列表按 `addedAt` 升序渲染，
 * 于是「常用的排在前面」不用另外存一个顺序字段，用过的自然浮上来。
 */
export function promoteView(id: string): StatsView[] {
  const views = loadViews();
  const target = views.find((view) => view.id === id);
  if (!target) return views;
  const rest = views.filter((view) => view.id !== id);
  return persist([...rest, { ...target, addedAt: Date.now() }].slice(-MAX_VIEWS));
}

export function removeView(id: string): StatsView[] {
  return persist(loadViews().filter((view) => view.id !== id));
}
