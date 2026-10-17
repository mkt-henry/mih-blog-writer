// 사이트 알림(/alerts) — Discord 웹훅 본문을 화면용·복사용으로 바꾸는 순수 함수.
//
// mih_alerts.payload 는 Discord 로 보낸 본문 그대로다({ content?, embeds? }).
// 화면은 Discord 처럼 그리고, 복사 버튼은 Discord 에서 글을 긁어 복사했을 때와 같은 글자를 준다
// (마크다운 표시 기호 `**` · 백틱은 걷어 낸다).

export type AlertField = { name: string; value: string; inline?: boolean };
export type AlertEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: AlertField[];
  footer?: { text?: string };
  timestamp?: string;
};
export type AlertPayload = { content?: string; embeds?: AlertEmbed[] };
export type AlertImage = { url: string; name?: string };

export type Alert = {
  id: number;
  channel: string;
  payload: AlertPayload;
  images: AlertImage[];
  created_at: string;
};

/** 알림 종류 — Discord 채널 이름과 맞춘다. */
export const CHANNEL_LABELS: Record<string, string> = {
  "new-article": "신규 원고",
  status: "발행 현황",
  search: "검색 노출",
  schedule: "예약 발행",
  "serp-shot": "검색 캡처",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

/** Discord 마크다운 표시 기호를 걷어 낸다(굵게·기울임 밑줄·인라인 코드). 링크 글자는 그대로 둔다. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/`([^`]*)`/g, "$1");
}

export function fieldText(f: AlertField): string {
  return `${stripMarkdown(f.name)}\n${stripMarkdown(f.value)}`;
}

export function embedText(e: AlertEmbed): string {
  const parts: string[] = [];
  if (e.title) parts.push(stripMarkdown(e.title));
  if (e.description) parts.push(stripMarkdown(e.description));
  for (const f of e.fields ?? []) parts.push(fieldText(f));
  return parts.join("\n\n");
}

/** 알림 한 건 전체의 복사용 글자. 본문 → 임베드 순서(Discord 화면 순서)로 잇는다. */
export function alertText(payload: AlertPayload): string {
  const parts: string[] = [];
  if (payload.content?.trim()) parts.push(stripMarkdown(payload.content.trim()));
  for (const e of payload.embeds ?? []) {
    const t = embedText(e);
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}

/** 본문을 줄 단위 조각으로 나눈다: **굵게**·`코드`·주소를 따로 그리기 위함. */
export type Segment = { kind: "text" | "bold" | "code" | "link"; text: string };

export function segments(line: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|(https?:\/\/[^\s<>()]+)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", text: line.slice(last, i) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else out.push({ kind: "link", text: m[3] });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** Discord 임베드 왼쪽 띠 색. 없으면 Discord 기본 회색. */
export function embedColor(color?: number): string {
  if (typeof color !== "number") return "#4E5058";
  return `#${color.toString(16).padStart(6, "0")}`;
}
