// 네이버 검색 노출 스크린샷 Discord 발송 — PR #23(2026-10-05) 전과 같은 형식.
//
// 2026-10-06 Owner: "당분간은 mih 는 디코로도 알림이 왔으면 좋겠어" — AIStudio 알림(notify.ts)과 함께 보낸다. 지우지 말 것.
// 웹훅은 환경 변수 NAVER_SEARCH_DISCORD_WEBHOOK_URL(Vercel production / GitHub repo secret)에만 둔다.
// 비우면 Discord 발송만 꺼진다(AIStudio 알림은 그대로).

export type PostScreenshotArgs = {
  webhookUrl: string;
  keyword: string;
  searchUrl: string;
  pngBuffer: Uint8Array;
};

/** 설정된 웹훅 주소. 없으면 null — Discord 를 끈 상태다. */
export function naverSearchDiscordWebhook(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.NAVER_SEARCH_DISCORD_WEBHOOK_URL?.trim() || null;
}

export async function postScreenshotToDiscord(args: PostScreenshotArgs): Promise<void> {
  const { webhookUrl, keyword, searchUrl, pngBuffer } = args;

  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: `🔎 ${keyword}\n${searchUrl}` }));

  const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
  const safeName = keyword.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 64) || 'screenshot';
  fd.append('files[0]', new File([blob], `${safeName}.png`, { type: 'image/png' }));

  const res = await fetch(webhookUrl, { method: 'POST', body: fd, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${text}`.slice(0, 500));
  }
}
