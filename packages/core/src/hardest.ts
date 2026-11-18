/**
 * 「最卡的地方」的汇总（v0.100.0）。
 *
 * 跟练时点级数方块单练某一小节，那一小节就记进 `guitar.rhythm.v1` 的 `hardest`
 * （`{bar, degree, name, count}`）。一条练习只有一个 `hardest`，所以这里只做汇总：
 * 把最近一段时间练过的条目按**级数**归堆，看这一周到底哪一级最容易卡。
 *
 * 只统计 `lastAt >= since` 的条目——练了一个月前的那条不该影响这周的结论。
 */

export interface HardestHit {
  bar: number;
  degree: number;
  name: string;
  count: number;
}

export interface HardestRecord {
  lastAt?: string;
  hardest?: HardestHit;
}

export interface HardestTally {
  degree: number;
  name: string;
  /** 这一级一共被单独点开过多少次。 */
  count: number;
  /** 有多少条练习的最卡处落在这一级。 */
  items: number;
}

/**
 * 按级数汇总「最卡的地方」，次数多的排前面；同分时级数小的排前面（根音更值得先看）。
 * `since` 是闭区间起点（`YYYY-MM-DD`）；`lastAt` 缺省或早于它的条目不参与。
 */
export function hardestTally(records: Record<string, HardestRecord | undefined>, since: string): HardestTally[] {
  const byDegree = new Map<number, HardestTally>();

  for (const record of Object.values(records)) {
    const hit = record?.hardest;
    if (!hit || !(hit.count > 0)) continue;
    const lastAt = record?.lastAt ?? "";
    if (!lastAt || lastAt < since) continue;
    const degree = Math.round(hit.degree);
    if (!Number.isFinite(degree) || degree < 1) continue;
    const tally = byDegree.get(degree) ?? {
      degree,
      name: hit.name || "",
      count: 0,
      items: 0,
    };
    tally.count += Math.round(hit.count);
    tally.items += 1;
    if (!tally.name && hit.name) tally.name = hit.name;
    byDegree.set(degree, tally);
  }

  return [...byDegree.values()].sort((a, b) => b.count - a.count || a.degree - b.degree);
}
