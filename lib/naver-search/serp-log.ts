import { supabaseAdmin } from '@/lib/supabase';
import type { SerpResult } from './exposure';
import type { PublishedArticle } from './schedule';
import type { Surface } from './search';

/** 지정한 발행일들에 발행 완료된 원고를 가져온다. published_at 이 null 인 대기 원고는 제외한다. */
export async function fetchArticlesPublishedOn(dates: string[]): Promise<PublishedArticle[]> {
  if (dates.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from('articles')
    .select('id, person_name, title, publish_date')
    .in('publish_date', dates)
    .not('published_at', 'is', null);
  if (error) throw new Error(`fetchArticlesPublishedOn: ${error.message}`);
  return (data ?? []) as PublishedArticle[];
}

/**
 * 검색 1회 결과를 그 쿼리를 공유하는 모든 원고에 기록한다.
 *
 * 미노출(`indexed=false`)도 반드시 남긴다 — 실패 사례가 이 프로젝트에서 가장 중요한 데이터다.
 * 같은 원고를 같은 날 두 번 넣는 것은 유니크 인덱스가 막으므로 upsert 로 흡수한다.
 */
export async function recordSerpChecks(args: {
  articleIds: string[];
  query: string;
  surface: Surface;
  result: SerpResult;
  screenshot?: string | null;
}): Promise<void> {
  if (args.articleIds.length === 0) return;
  const rows = args.articleIds.map((article_id) => ({
    article_id,
    query: args.query,
    surface: args.surface,
    indexed: args.result.indexed,
    rank: args.result.rank,
    competitors: args.result.competitors,
    screenshot: args.screenshot ?? null,
    // 블로그 링크가 하나도 없었다는 뜻. 블로그 탭에서는 응답이 막혔거나 파서가 고장난 것이고,
    // 통합검색에서는 그 쿼리에 블로그 영역 자체가 없는 경우도 있다. 미노출과는 구분해서 남긴다.
    note: args.result.parseFailed ? 'no-blog-results' : null,
  }));
  const { error } = await supabaseAdmin()
    .from('mih_serp_checks')
    .upsert(rows, { onConflict: 'article_id,surface,checked_on', ignoreDuplicates: true });
  if (error) throw new Error(`recordSerpChecks: ${error.message}`);
}
