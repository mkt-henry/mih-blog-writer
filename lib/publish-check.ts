// 오늘 발행이 계정별 3편을 채웠는지 따진다(점검 스크립트 scripts/check-today-publish.ts 가 쓴다).
// 네트워크·DB 없이 돌아가게 순수 함수로만 둔다 — 테스트는 tests/publish-check.test.ts.
import { REPORT_AGENCIES, type RssByAgency, type ReportAgency } from "./daily-report";

export const PER_ACCOUNT = 3;
/** 매일 3편씩 나가야 하는 계정. 섭외(mih_casting)는 로그인이 풀린 채라 최근에 글이 나간 날만 센다. */
export const CORE_ACCOUNTS: ReportAgency[] = ["mih_agency", "mih_speaker", "other"];
const CASTING: ReportAgency = "mih_casting";
const ACTIVE_WINDOW_DAYS = 3;

const KST_OFFSET = 9 * 3600_000;
const kstDay = (ts: number) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10);

export interface DbArticle {
  agency: string;
  published_at: string | null;
  reserved_at: string | null;
  published_url: string | null;
}

export interface AccountResult {
  agency: ReportAgency;
  label: string;
  published: number;
  /** DB 에 오늘 날짜로 걸린 예약 수 */
  scheduled: number;
  /** 예약도 발행도 안 된 대기 원고 수 */
  waiting: number;
  short: boolean;
  reason: string;
}

export interface PublishCheck {
  day: string;
  target: number;
  published: number;
  accounts: AccountResult[];
  shortAccounts: AccountResult[];
}

const LABELS: Record<ReportAgency, string> = {
  mih_agency: "에이전시",
  mih_speaker: "인플루언스",
  mih_casting: "섭외",
  other: "기타",
};

export function checkPublish(rss: RssByAgency, rows: DbArticle[], now: number): PublishCheck {
  const day = kstDay(now);
  const windowStart = now - ACTIVE_WINDOW_DAYS * 86400_000;
  const castingActive = (rss[CASTING] ?? []).some((r) => r.ts >= windowStart && r.ts <= now);
  const targets = castingActive ? [...CORE_ACCOUNTS, CASTING] : CORE_ACCOUNTS;

  const accounts = targets.map((agency): AccountResult => {
    const published = (rss[agency] ?? []).filter((r) => r.ts && kstDay(r.ts) === day).length;
    const mine = rows.filter((r) => r.agency === agency);
    const scheduled = mine.filter((r) => r.published_at && kstDay(Date.parse(r.published_at)) === day).length;
    const waiting = mine.filter((r) => !r.published_at && !r.reserved_at && !r.published_url).length;
    const short = published < PER_ACCOUNT;
    let reason = "";
    if (short) {
      if (scheduled === 0) {
        reason = `오늘 나갈 예약이 하나도 안 걸려 있었어(전날 예약 때 대기 원고가 ${PER_ACCOUNT}편이 안 됐거나 로그인이 풀려 건너뛴 것)`;
      } else if (scheduled < PER_ACCOUNT) {
        reason = `오늘 예약이 ${scheduled}편만 걸려 있었어`;
      } else {
        reason = `예약은 ${scheduled}편 걸려 있었는데 ${published}편만 올라왔어(예약이 풀렸거나 발행이 막혔을 수 있어)`;
      }
      reason += ` · 지금 대기 원고 ${waiting}편`;
    }
    return { agency, label: LABELS[agency] ?? REPORT_AGENCIES[agency].label, published, scheduled, waiting, short, reason };
  });

  return {
    day,
    target: targets.length * PER_ACCOUNT,
    published: accounts.reduce((n, a) => n + a.published, 0),
    accounts,
    shortAccounts: accounts.filter((a) => a.short),
  };
}

/** 할 일 카드 제목·설명. Owner 가 그대로 읽으니 쉬운 말로만 쓴다. */
export function todoCard(c: PublishCheck): { title: string; text: string } {
  const shortNames = c.shortAccounts.map((a) => `${a.label} ${a.published}건`).join(", ");
  const title = `MIH ${c.day.slice(5)} 발행 ${c.published}/${c.target}건 — ${shortNames}`;
  const lines = c.accounts.map(
    (a) => `- ${a.label}: ${a.published}/${PER_ACCOUNT}건${a.short ? ` — ${a.reason}` : ""}`,
  );
  const text = [
    `낮 12시 점검에서 오늘 발행이 ${c.target}건이 안 된 걸 찾았어(블로그에 실제로 올라온 글 기준).`,
    "",
    ...lines,
    "",
    "빈 자리를 오늘 대기 원고로 채울지, 원인(원고 부족·로그인·예약 풀림)부터 고칠지 정해 줘.",
  ].join("\n");
  return { title, text };
}
