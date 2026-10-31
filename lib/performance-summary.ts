// 오늘 화면 검색 노출 탭 아래 "성과 요약"(Owner 2026-10-31 "하단에 성과를 요약해서 보여주고 복사").
// 그날 발행한 키워드마다 로그인 없이 본 네이버 통합검색 순위를 모아 한 덩어리 글로 만든다.
// 순위는 앱 검색 팝업 배지와 같은 수(화면의 검색 결과 순서, 광고 제외)다.

/** undefined = 확인 중, null = 첫 화면에 없음, "error" = 확인 못 함 */
export type RankValue = number | null | undefined | "error";

export interface PerformanceLine {
  keyword: string;
  rank: RankValue;
}

export const rankLabel = (rank: RankValue): string =>
  rank === undefined ? "확인 중" : rank === "error" ? "확인 못 함" : rank === null ? "미노출" : `${rank}위`;

export function performanceCounts(lines: PerformanceLine[]) {
  const ranks = lines.map((l) => l.rank).filter((r): r is number => typeof r === "number");
  return {
    total: lines.length,
    exposed: ranks.length,
    top1: ranks.filter((r) => r === 1).length,
    top3: ranks.filter((r) => r <= 3).length,
    pending: lines.filter((l) => l.rank === undefined).length,
  };
}

/** "10/30 발행 6건 검색 성과 (통합검색 · 10/31 13:50 기준)" 이하 키워드별 순위. */
export function performanceText(day: string, lines: PerformanceLine[], asOf: string): string {
  const c = performanceCounts(lines);
  const d = day.slice(5).replace("-", "/");
  return [
    `▶ ${d} 발행 ${c.total}건 검색 성과 (네이버 통합검색 · ${asOf} 기준)`,
    `노출 ${c.exposed}/${c.total}건 · 1위 ${c.top1}건 · 3위 안 ${c.top3}건`,
    "",
    ...lines.map((l) => `${l.keyword} ${rankLabel(l.rank)}`),
  ].join("\n");
}
