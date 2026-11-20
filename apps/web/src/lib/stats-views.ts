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

/** 一组筛选叫什么：「第 5 级」「第 1 阶段」「第 5 级 · 第 1 阶段」。 */
export function viewLabel(degree: number | null, stage: number | null): string {
  const parts: string[] = [];
  if (degree !== null) parts.push(`第 ${degree} 级`);
  if (stage !== null) parts.push(`第 ${stage + 1} 阶段`);
  return parts.length > 0 ? parts.join(" · ") : "全部";
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
    if (!id || (degree === null && stage === null)) continue;
    const key = `${degree ?? "-"}|${stage ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof record.name === "string" ? cleanViewName(record.name) : "";
    views.push({
      id,
      degree,
      stage,
      label: viewLabel(degree, stage),
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
  name = "",
): StatsView[] {
  if (degree === null && stage === null) return loadViews();
  const views = loadViews();
  const exists = views.find((view) => view.degree === degree && view.stage === stage);
  if (exists) return views;
  const clean = cleanViewName(name);
  const next: StatsView = {
    id: `v-${Date.now().toString(36)}`,
    degree,
    stage,
    label: viewLabel(degree, stage),
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
