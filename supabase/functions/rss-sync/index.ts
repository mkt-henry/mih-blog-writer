// 네이버 RSS를 fetch해 articles와 매칭 → published_at/published_url을 채운다.
// 매칭 실패 항목은 unmatched_rss_items에 upsert.
//
// 트리거: pg_cron이 10분마다 net.http_post 로 호출.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type AgencySlug = 'mih_speaker' | 'mih_casting' | 'mih_agency' | 'other';
const SLUGS: AgencySlug[] = ['mih_speaker', 'mih_casting', 'mih_agency', 'other'];
const BLOG_SLUGS: Record<AgencySlug, string> = {
  mih_speaker: 'mih_speaker',
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

  const results = await Promise.all(SLUGS.map(async (slug) => {
    try {
      const items = await fetchRss(slug);
      return { slug, items, error: null as string | null };
    } catch (e) {
      return { slug, items: [], error: (e as Error).message };
    }
  }));

  let matchedCount = 0;
  let unmatchedCount = 0;
  const errors: string[] = [];

  for (const { slug, items, error } of results) {
    if (error) errors.push(`${slug}: ${error}`);
    for (const item of items) {
      const rss: RssItem = { agency: slug, title: item.title, link: item.link, pub_ts: item.pub_ts };
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
          const idx = candidates.findIndex((c) => c.id === matched.id);
          if (idx >= 0) candidates.splice(idx, 1);
          // 이전 sync에서 미매칭으로 기록됐던 항목 삭제
          await sb.from('unmatched_rss_items').delete()
            .eq('agency', slug).eq('link', item.link);
        }
      } else if (!publishedUrls.has(item.link)) {
        // 이미 발행된 원고의 RSS 링크는 미매칭으로 집계하지 않음
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
      unmatched: unmatchedCount,
      errors,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
