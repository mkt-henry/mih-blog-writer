import { notifyAistudio } from '@/lib/aistudio-notify';

export type PostScreenshotArgs = {
  keyword: string;
  searchUrl: string;
  pngBuffer: Uint8Array;
  /** 검색 노출을 확인한 발행일(D+1). 같은 날 다시 돌려도 알림이 하나로 묶이게 키에 쓴다. */
  date: string;
};

/**
 * 통합검색에 노출된 키워드 한 건의 스크린샷을 AIStudio 알림함에 남긴다.
 * 하루 수 건~십여 건이 한꺼번에 오므로 건마다 푸시하지 않는다(push:false).
 * 푸시는 실행이 끝난 뒤 요약 알림 한 번(postSerpSummary)으로 간다.
 */
export async function postScreenshotNotice(args: PostScreenshotArgs): Promise<void> {
  const { keyword, searchUrl, pngBuffer, date } = args;
  const safeName = keyword.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 64) || 'screenshot';
  await notifyAistudio({
    title: `🔎 ${keyword}`,
    body: `${date} 발행 · 네이버 통합검색 노출\n${searchUrl}`,
    url: searchUrl,
    level: 'success',
    images: [{ name: `${safeName}.png`, data: pngBuffer }],
    dedupeKey: `serp-shot-${date}-${keyword}`,
    dedupeMinutes: 1440,
    push: false,
  });
}

export type SerpSummary = {
  date: string;
  groups: number;
  exposedTotal: number;
  indexedBlogTab: number;
  missed: number;
  posted: number;
  errors: string[];
};

/** 하루 한 번 요약. 스크린샷 알림이 알림함에 몇 건 쌓였는지와 오류를 알린다. */
export async function postSerpSummary(s: SerpSummary): Promise<void> {
  const lines = [
    `- 확인한 쿼리: ${s.groups}개`,
    `- 통합검색 노출: ${s.exposedTotal}개 · 블로그탭 색인: ${s.indexedBlogTab}개 · 미노출: ${s.missed}개`,
    `- ${s.date} 발행분 노출 스크린샷: ${s.posted}건 (알림함)`,
  ];
  if (s.errors.length) lines.push('', `**오류 ${s.errors.length}건**`, ...s.errors.slice(0, 15).map((e) => `- ${e}`));
  await notifyAistudio({
    title: `🔎 MIH 검색 노출 확인 · ${s.date} 발행분 ${s.posted}건 노출`,
    body: lines.join('\n'),
    level: s.errors.length ? 'warning' : 'success',
    dedupeKey: `serp-summary-${s.date}`,
    dedupeMinutes: 1440,
    // 노출도 오류도 없는 날은 예전 Discord 처럼 조용히(알림함에만) 둔다.
    push: s.posted > 0 || s.errors.length > 0,
  });
}

/** 수동 점검용. 같은 보내는 길(토큰·주소)로 푸시 없는 [테스트] 알림 하나만 보낸다. */
export async function postSerpTestNotice(where: string): Promise<void> {
  await notifyAistudio({
    title: `[테스트] MIH 네이버 검색 노출 알림 (${where})`,
    body: '네이버 검색 노출 스크린샷 알림이 Discord 대신 AIStudio 로 온다. 이 알림은 연결 확인용이다.',
    level: 'info',
    dedupeKey: `serp-test-${where}`,
    push: false,
  });
}
