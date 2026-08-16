/** `"<인물명> 섭외"` 로 만든다. 이미 `섭외` 로 끝나면 덧붙이지 않는다.
 *  index.ts 에 있던 것을 옮겨왔다 — index.ts 가 이 파일을 import 하므로 반대 방향은 순환이다. */
export function toSearchQuery(baseKeyword: string): string {
  const trimmed = baseKeyword.trim();
  return /섭외$/.test(trimmed) ? trimmed : `${trimmed} 섭외`;
}

/** 발행 후 이 날짜들에만 확인한다. 매일 전량 재검색하면 비용이 발행 누적에 비례해 는다. */
export const CHECK_OFFSETS = [1, 3, 7, 14, 30] as const;

export type PublishedArticle = {
  id: string;
  person_name: string | null;
  title: string;
  publish_date: string;
};

export type CheckGroup = { query: string; articleIds: string[] };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDateMinus(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS - days * DAY_MS).toISOString().slice(0, 10);
}

/** timestamptz 문자열의 KST 달력 날짜. 실제 발행 시각으로 D+N 을 재는 데 쓴다. */
export function kstDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function targetDates(now: Date = new Date()): string[] {
  return CHECK_OFFSETS.map((d) => kstDateMinus(d, now));
}

/** 제목 앞머리의 `[키워드]` 를 뽑는다. person_name 이 비어 있는 옛 행을 위한 폴백이다. */
function bracketKeyword(title: string): string | null {
  return title.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || null;
}

export function articleQuery(a: PublishedArticle): string | null {
  const base = a.person_name?.trim() || bracketKeyword(a.title);
  return base ? toSearchQuery(base) : null;
}

/** 같은 인물이 여러 계정에서 발행됐으면 검색은 한 번, 기록은 원고마다. */
export function groupByQuery(articles: PublishedArticle[]): CheckGroup[] {
  const byQuery = new Map<string, string[]>();
  for (const a of articles) {
    const q = articleQuery(a);
    if (!q) continue;
    const list = byQuery.get(q);
    if (list) list.push(a.id);
    else byQuery.set(q, [a.id]);
  }
  return [...byQuery].map(([query, articleIds]) => ({ query, articleIds }));
}
