// 사이트 알림 한 건(Discord 웹훅 본문) → 앱 푸시 한 건. 순수 변환만 여기 둔다(vitest 가 직접 불러 시험한다).
//
// 푸시 알림은 서식이 없으니 표시 기호를 걷어 내고, 임베드 제목(없으면 본문 첫 줄)을 제목으로,
// 임베드 항목·나머지 줄을 본문으로 삼는다. 전문과 복사 버튼은 사이트 /alerts 에 있다.

export interface WebhookPayload {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    fields?: Array<{ name?: string; value?: string }>;
  }>;
}

export interface PushMessage {
  title: string;
  body: string;
  /** 알림을 누르면 열 사이트 경로 — 그 알림으로 바로 간다. */
  url: string;
  /** 같은 알림이 두 번 떠도 하나로 묶는다. */
  tag: string;
  image?: string;
}

/** 안드로이드·iOS 모두 펼쳐도 몇 줄만 보인다. 암호화 후 4KB 한도 안에 넉넉히 들어가는 길이. */
const MAX_BODY = 400;

const LABELS: Record<string, string> = {
  "new-article": "신규 원고",
  status: "발행 현황",
  search: "검색 노출",
  schedule: "예약 발행",
  "serp-shot": "검색 캡처",
};

export function plain(line: string): string {
  return line
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*]\s+/, "· ")
    .trim();
}

export function toPush(
  id: number | string,
  channel: string,
  payload: WebhookPayload,
  images: Array<{ url?: string }> = [],
): PushMessage {
  const contentLines = (payload.content ?? "").split("\n").map(plain).filter(Boolean);
  const embed = payload.embeds?.[0];

  let title: string;
  let lines: string[];
  if (embed?.title) {
    title = plain(embed.title);
    lines = [
      ...contentLines,
      ...(embed.description ?? "").split("\n").map(plain).filter(Boolean),
      ...(embed.fields ?? []).flatMap((f) => {
        const value = (f.value ?? "").split("\n").map(plain).filter(Boolean);
        // 짧은 항목(계정·발행일)은 "이름: 값" 한 줄로, 긴 항목은 값만 줄줄이.
        return value.length === 1 ? [`${plain(f.name ?? "")}: ${value[0]}`] : value;
      }),
    ];
  } else {
    title = contentLines[0] ?? `MIH ${LABELS[channel] ?? "알림"}`;
    lines = contentLines.slice(1);
  }

  const body = lines.join("\n");
  const image = images.find((i) => i.url)?.url;
  return {
    title: title.slice(0, 120),
    body: body.length > MAX_BODY ? body.slice(0, MAX_BODY - 1) + "…" : body,
    url: `/alerts#a${id}`,
    tag: `mih-alert-${id}`,
    ...(image ? { image } : {}),
  };
}
