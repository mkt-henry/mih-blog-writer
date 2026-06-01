import type { AgencySlug } from '@/lib/agencies';

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
};

export type AgencyGroup = {
  pool: ArticleRow[];
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

function buildPersonPublishedMap(articles: ArticleRow[]): Map<string, PersonPublished> {
  const map = new Map<string, PersonPublished>();
  for (const a of articles) {
    if (!a.published_at || !a.person_name) continue;
    const cur = map.get(a.person_name);
    if (!cur || a.published_at < cur.published_at) {
      map.set(a.person_name, {
        published_at: a.published_at,
        published_url: a.published_url,
        published_source: a.published_source,
      });
    }
  }
  return map;
}

function projectSiblingPublication(articles: ArticleRow[]): ArticleRow[] {
  const personPublished = buildPersonPublishedMap(articles);
  return articles.map((a) => {
    if (a.published_at) return a;
    const sib = personPublished.get(a.person_name);
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

  const empty = (): AgencyGroup => ({ pool: [], today: [], recent: [] });
  const groups: KanbanGroups = {
    mih_speaker: empty(),
    mih_casting: empty(),
    mih_agency: empty(),
    other: empty(),
  };

  for (const a of projected) {
    const g = groups[a.agency];
    if (!g) continue;
    if (a.published_at === null) {
      g.pool.push(a);
    } else if (Date.parse(a.published_at) >= todayStart) {
      g.today.push(a);
    } else {
      g.recent.push(a);
    }
  }

  for (const slug of Object.keys(groups) as AgencySlug[]) {
    groups[slug].pool.sort((a, b) => a.created_at.localeCompare(b.created_at));
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

  let pool = 0;
  let today = 0;
  let week = 0;
  for (const a of projected) {
    if (a.published_at === null) {
      pool++;
      continue;
    }
    const t = Date.parse(a.published_at);
    if (t >= todayStart) today++;
    if (t >= weekStart) week++;
  }
  return { poolTotal: pool, todayTotal: today, weekTotal: week, unmatchedNeedReview: unmatchedCount };
}

const SECTIONS: ('pool' | 'today' | 'recent')[] = ['pool', 'today', 'recent'];

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
