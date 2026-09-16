import type { AgencySlug } from '@/lib/agencies';
import { namesOf } from '@/lib/name-match.mjs';

export type ArticleRow = {
  id: string;
  publish_date: string;
  agency: AgencySlug;
  slug: string;
  person_name: string;
  title: string;
  source_path: string | null;
  instagram_url: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_url: string | null;
  published_source: 'rss' | 'manual' | null;
  reserved_at: string | null;
};

export type AgencyGroup = {
  pool: ArticleRow[];
  reserved: ArticleRow[];
  today: ArticleRow[];
  recent: ArticleRow[];
};

export type KanbanGroups = Record<AgencySlug, AgencyGroup>;

const KST_OFFSET_MS = 9 * 3600_000;

function kstMidnightMs(now = Date.now()): number {
  return Math.floor((now + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
}

type PersonPublished = {
  published_at: string;
  published_url: string | null;
  published_source: 'rss' | 'manual' | null;
};

const personKeys = (a: { person_name: string | null; title: string | null }) =>
  namesOf({ person_name: (a.person_name ?? '').trim(), title: a.title });

/**
 * "발행 대기" 목록의 단일 규칙 — 계정 피드(/mih_agency 등)와 대시보드가 같은 숫자를 내야 한다.
 *   - 이미 발행된 인물(표기 변형 포함: "CAMO(카모)" = "카모")은 뺀다.
 *   - 한 인물의 대기 원고가 여럿이면 최신 1개만 남긴다(1인 1원고).
 * 결과는 created_at 오래된순. 예약 완료(reserved_at) 분리는 호출 측이 한다.
 */
export function pendingQueue<T extends { person_name: string | null; title: string | null; created_at: string }>(
  pending: T[],
  publishedNames: Set<string>,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of [...pending].sort((x, y) => y.created_at.localeCompare(x.created_at))) {
    const keys = personKeys(a);
    if (keys.some((k) => publishedNames.has(k) || seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(a);
  }
  return out.reverse();
}

function buildPersonPublishedMap(articles: ArticleRow[]): Map<string, PersonPublished> {
  const map = new Map<string, PersonPublished>();
  for (const a of articles) {
    if (!a.published_at) continue;
    for (const k of personKeys(a)) {
      const cur = map.get(k);
      if (!cur || a.published_at < cur.published_at) {
        map.set(k, {
          published_at: a.published_at,
          published_url: a.published_url,
          published_source: a.published_source,
        });
      }
    }
  }
  return map;
}

function projectSiblingPublication(articles: ArticleRow[]): ArticleRow[] {
  const personPublished = buildPersonPublishedMap(articles);
  return articles.map((a) => {
    if (a.published_at) return a;
    const sib = personKeys(a)
      .map((k) => personPublished.get(k))
      .find(Boolean);
    if (!sib) return a;
    return {
      ...a,
      published_at: sib.published_at,
      published_url: a.published_url ?? sib.published_url,
      published_source: sib.published_source,
    };
  });
}

export function groupArticlesForKanban(articles: ArticleRow[], now = Date.now()): KanbanGroups {
  const todayStart = kstMidnightMs(now);
  const projected = projectSiblingPublication(articles);

  const empty = (): AgencyGroup => ({ pool: [], reserved: [], today: [], recent: [] });
  const groups: KanbanGroups = {
    mih_speaker: empty(),
    mih_casting: empty(),
    mih_agency: empty(),
    other: empty(),
  };

  for (const a of projected) {
    const g = groups[a.agency];
    if (!g || a.published_at === null) continue;
    if (Date.parse(a.published_at) >= todayStart) {
      g.today.push(a);
    } else {
      g.recent.push(a);
    }
  }

  // 발행본이 있는 인물은 위 projection 에서 이미 발행 쪽으로 넘어갔으므로 빈 집합을 넘긴다.
  for (const slug of Object.keys(groups) as AgencySlug[]) {
    const unpublished = projected.filter((a) => a.agency === slug && a.published_at === null);
    for (const a of pendingQueue(unpublished, new Set())) {
      (a.reserved_at ? groups[slug].reserved : groups[slug].pool).push(a);
    }
    groups[slug].today.sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''));
    groups[slug].recent.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }

  return groups;
}

export type KanbanKpis = {
  poolTotal: number;
  todayTotal: number;
  weekTotal: number;
  unmatchedNeedReview: number;
};

export function computeKpis(articles: ArticleRow[], unmatchedCount: number, now = Date.now()): KanbanKpis {
  const todayStart = kstMidnightMs(now);
  const weekStart = todayStart - 6 * 86400_000;
  const projected = projectSiblingPublication(articles);
  const groups = groupArticlesForKanban(articles, now);
  const pool = Object.values(groups).reduce((n, g) => n + g.pool.length, 0);

  let today = 0;
  let week = 0;
  for (const a of projected) {
    if (a.published_at === null) continue;
    const t = Date.parse(a.published_at);
    if (t >= todayStart) today++;
    if (t >= weekStart) week++;
  }
  return { poolTotal: pool, todayTotal: today, weekTotal: week, unmatchedNeedReview: unmatchedCount };
}

const SECTIONS: (keyof AgencyGroup)[] = ['pool', 'reserved', 'today', 'recent'];

export function findNeighbor(
  groups: KanbanGroups,
  currentId: string,
  direction: 'prev' | 'next'
): string | null {
  for (const slug of Object.keys(groups) as AgencySlug[]) {
    for (const sec of SECTIONS) {
      const list = groups[slug][sec];
      const idx = list.findIndex((a) => a.id === currentId);
      if (idx === -1) continue;
      const nextIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= list.length) return null;
      return list[nextIdx].id;
    }
  }
  return null;
}
