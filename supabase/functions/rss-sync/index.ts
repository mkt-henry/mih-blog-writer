// 네이버 RSS를 fetch해 articles와 매칭 → published_at/published_url을 채운다.
// 매칭 실패한 섭외글([..] 패턴)은 발행행으로 직접 누적(ingest)한다.
//   → 초안 없이 네이버에 직접 발행된 글도 DB에 빠짐없이 반영(DB = 발행 현실).
// 섭외글 패턴이 아닌 항목(공지 등)만 unmatched_rss_items에 진단용으로 남긴다.
//
// 트리거: pg_cron이 매일 09:55 KST 에 net.http_post 로 호출.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type AgencySlug = 'mih_speaker' | 'mih_casting' | 'mih_agency' | 'other';
const SLUGS: AgencySlug[] = ['mih_speaker', 'mih_casting', 'mih_agency', 'other'];
const BLOG_SLUGS: Record<AgencySlug, string> = {
  mih_speaker: 'gdfdhzgfgfhgdj',
  mih_casting: 'mih_casting',
  mih_agency: 'mih_agency',
  other: 'kyh620303',
};

type RssItem = { agency: AgencySlug; title: string; link: string; pub_ts: number };
type Candidate = {
  id: string;
  person_name: string;
  slug: string;
  title: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

function normalizeTitle(s: string): string {
  return s.replace(/[ 　]/g, ' ').replace(/\s+/g, ' ').trim();
}

// 인물명 비교 정규화 — 괄호 주석 제거 + 공백 제거 + 소문자.
// lib/name-match.mjs 의 norm() 과 동일 규칙이어야 한다(엣지 함수는 Deno 라 그 모듈을 import 할 수 없어 복제).
function normKey(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[\(（].*$/s, '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 발행 URL 은 RSS 링크에서 추적 쿼리를 떼고 저장한다(키워드 화면 노출용).
const canonicalUrl = (u: string): string => u.replace(/\?.*$/, '');

// keywords 중 published_url 이 비어 있는 행들의 normKey → id 목록.
// PostgREST 는 정규화 비교를 서버에서 못 하므로 전량을 받아 메모리에서 맞춘다.
// range 없이 select 하면 1000행에서 잘리므로 반드시 페이지네이션한다(키워드 6100+).
async function loadKeywordMap(
  // deno-lint-ignore no-explicit-any
  sb: any,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('keywords')
      .select('id,keyword,published_url')
      .order('id')
      .range(from, from + 999);
    if (error || !data) break;
    for (const k of data as Array<{ id: string; keyword: string; published_url: string | null }>) {
      if (k.published_url) continue; // 이미 발행 표기됨
      const key = normKey(k.keyword);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(k.id);
      map.set(key, arr);
    }
    if (data.length < 1000) break;
  }
  return map;
}

// 발행이 확정된 인물의 키워드에 발행 URL 을 찍는다.
// 이걸 빼먹은 동안 발행 922건 중 keywords.published_url 이 채워진 건 9건뿐이어서
// 키워드 화면의 '발행 완료' 표시·필터가 사실상 무동작이었다.
async function stampKeywords(
  // deno-lint-ignore no-explicit-any
  sb: any,
  kwMap: Map<string, string[]>,
  names: Array<string | null | undefined>,
  link: string,
  errors: string[],
): Promise<void> {
  const keys = [...new Set(names.map(normKey).filter(Boolean))];
  const ids = new Set<string>();
  for (const key of keys) for (const id of kwMap.get(key) ?? []) ids.add(id);
  if (ids.size === 0) return;
  const { error } = await sb
    .from('keywords')
    .update({ published_url: canonicalUrl(link) })
    .in('id', [...ids])
    .is('published_url', null);
  if (error) errors.push(`keyword stamp ${keys.join('/')}: ${error.message}`);
  else for (const key of keys) kwMap.delete(key); // 같은 실행에서 중복 갱신 방지
}

function extractTitleKeyword(rawTitle: string): string | null {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}

function pickOldest(cands: Candidate[]): Candidate {
  return [...cands].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

type MatchReason = 'exact_title' | 'person_name_bracket' | 'keyword_to_person' | 'keyword_to_slug' | 'none';

function matchRssItem(rss: RssItem, candidates: Candidate[]): { matched: Candidate | null; reason: MatchReason } {
  const sameAgency = candidates.filter((c) => c.agency === rss.agency && c.published_at === null);
  if (sameAgency.length === 0) return { matched: null, reason: 'none' };

  const rssNorm = normalizeTitle(rss.title);

  const exact = sameAgency.filter((c) => normalizeTitle(c.title) === rssNorm);
  if (exact.length > 0) return { matched: pickOldest(exact), reason: 'exact_title' };

  const rssKeyword = extractTitleKeyword(rss.title);
  if (rssKeyword) {
    const personMatch = sameAgency.filter((c) => normalizeTitle(c.person_name) === normalizeTitle(rssKeyword));
    if (personMatch.length > 0) {
      const expectedBracket = `[${rssKeyword} 섭외]`;
      const rssHasBracket = rssNorm.startsWith(expectedBracket);
      return { matched: pickOldest(personMatch), reason: rssHasBracket ? 'person_name_bracket' : 'keyword_to_person' };
    }
    const slugMatch = sameAgency.filter((c) => c.slug === rssKeyword);
    if (slugMatch.length > 0) return { matched: pickOldest(slugMatch), reason: 'keyword_to_slug' };
  }

  return { matched: null, reason: 'none' };
}

function parseRss(xml: string): { title: string; link: string; pub_ts: number }[] {
  const items: { title: string; link: string; pub_ts: number }[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const pub_ts = pubDate ? new Date(pubDate).getTime() : 0;
    if (title && link && pub_ts) items.push({ title, link, pub_ts });
  }
  return items;
}

async function fetchRss(slug: AgencySlug): Promise<{ title: string; link: string; pub_ts: number }[]> {
  const blogSlug = BLOG_SLUGS[slug];
  const res = await fetch(`https://rss.blog.naver.com/${blogSlug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-RSS-Sync/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

Deno.serve(async () => {
  const startedAt = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: unpub, error: e1 } = await sb
    .from('articles')
    .select('id,person_name,slug,title,agency,created_at,published_at')
    .is('published_at', null);
  if (e1) {
    return new Response(JSON.stringify({ ok: false, error: e1.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const candidates = (unpub || []) as Candidate[];

  // 이미 published_url이 설정된 원고의 링크 목록 — 재매칭 방지용
  const { data: pubLinks } = await sb
    .from('articles')
    .select('published_url')
    .not('published_url', 'is', null);
  const publishedUrls = new Set((pubLinks || []).map((r: { published_url: string }) => r.published_url));

  // 발행 확정 시 keywords.published_url 도 함께 찍기 위한 조회(정규화 매칭용).
  const kwMap = await loadKeywordMap(sb);

  const results = await Promise.all(SLUGS.map(async (slug) => {
    try {
      const items = await fetchRss(slug);
      return { slug, items, error: null as string | null };
    } catch (e) {
      return { slug, items: [], error: (e as Error).message };
    }
  }));

  let matchedCount = 0;
  let ingestedCount = 0;
  let unmatchedCount = 0;
  const errors: string[] = [];

  for (const { slug, items, error } of results) {
    if (error) errors.push(`${slug}: ${error}`);
    for (const item of items) {
      const rss: RssItem = { agency: slug, title: item.title, link: item.link, pub_ts: item.pub_ts };

      // 이미 다른 발행 원고에 할당된 URL이면 건너뜀.
      // (한 인물에 미발행 초안이 2개 이상일 때, 같은 블로그 글이 두 초안 모두에
      //  발행 도장을 찍던 중복발행 버그 방지.) 남아있는 미매칭 기록은 정리.
      if (publishedUrls.has(item.link)) {
        await sb.from('unmatched_rss_items').delete().eq('agency', slug).eq('link', item.link);
        continue;
      }

      const { matched, reason } = matchRssItem(rss, candidates);

      if (matched && reason !== 'none') {
        const { error: upErr } = await sb.from('articles')
          .update({
            published_at: new Date(item.pub_ts).toISOString(),
            published_url: item.link,
            published_source: 'rss',
          })
          .eq('id', matched.id)
          .is('published_at', null);
        if (upErr) errors.push(`update ${matched.id}: ${upErr.message}`);
        else {
          matchedCount++;
          publishedUrls.add(item.link);
          await stampKeywords(
            sb,
            kwMap,
            [matched.person_name, extractTitleKeyword(item.title)],
            item.link,
            errors,
          );
          const idx = candidates.findIndex((c) => c.id === matched.id);
          if (idx >= 0) candidates.splice(idx, 1);
          // 이전 sync에서 미매칭으로 기록됐던 항목 삭제
          await sb.from('unmatched_rss_items').delete()
            .eq('agency', slug).eq('link', item.link);
        }
      } else if (/^\s*\[.+?\]/.test(item.title)) {
        // 누적: 대응 초안이 없는 섭외글을 새 발행행으로 직접 등록.
        // (매칭은 위에서 제목/인물명/slug까지 시도하므로, 여기까지 온 건 초안 자체가 없는 글.)
        const person = extractTitleKeyword(item.title) ?? item.title;
        const date = new Date(item.pub_ts + 9 * 3600_000).toISOString().slice(0, 10);
        const logNo = item.link.match(/\/(\d{6,})(?:\?|$)/)?.[1] ?? String(item.pub_ts);
        const baseRow = {
          publish_date: date,
          agency: slug,
          person_name: person,
          title: item.title,
          html_content: '<!-- RSS 누적 등록: 원본 초안 없음 -->',
          published_at: new Date(item.pub_ts).toISOString(),
          published_url: item.link,
          published_source: 'rss',
          notes: 'RSS 누적(초안 없음)',
        };
        // 슬러그 유니크 제약(publish_date, agency, slug) 충돌 시 logNo 접미로 재시도
        let { error: insErr } = await sb.from('articles').insert({ ...baseRow, slug: person });
        if (insErr && /duplicate key|23505/.test(insErr.message)) {
          ({ error: insErr } = await sb.from('articles').insert({ ...baseRow, slug: `${person}-${logNo}` }));
        }
        if (insErr) {
          errors.push(`ingest ${item.link}: ${insErr.message}`);
        } else {
          ingestedCount++;
          publishedUrls.add(item.link);
          await stampKeywords(sb, kwMap, [person, extractTitleKeyword(item.title)], item.link, errors);
          await sb.from('unmatched_rss_items').delete().eq('agency', slug).eq('link', item.link);
        }
      } else {
        // 섭외글 패턴이 아님(공지 등) → 미매칭 항목으로 기록 (진단용)
        unmatchedCount++;
        await sb.from('unmatched_rss_items').upsert({
          agency: slug,
          link: item.link,
          title: item.title,
          pub_ts: item.pub_ts,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'agency,link' });
      }
    }
  }

  const sixtyDaysAgo = Date.now() - 60 * 24 * 3600_000;
  await sb.from('unmatched_rss_items').delete().lt('pub_ts', sixtyDaysAgo);

  // 이미 published_url이 매칭된 링크는 unmatched에서 일괄 제거
  if (publishedUrls.size > 0) {
    await sb.from('unmatched_rss_items').delete().in('link', [...publishedUrls]);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      duration_ms: Date.now() - startedAt,
      matched: matchedCount,
      ingested: ingestedCount,
      unmatched: unmatchedCount,
      errors,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
