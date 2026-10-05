// AIStudio 알림(Owner 휴대폰 푸시 + 알림함). Discord 를 대신한다(2026-10-05 Owner 결정).
//
// 토큰은 보내는 곳마다 따로다: Vercel 은 Vercel 환경 변수, GitHub Actions 는 repo secret,
// Windows 는 .env.local 의 AISTUDIO_NOTIFY_TOKEN. 토큰이 이 프로젝트(mih-blog-writer)에 묶여 있어
// 알림은 늘 MIH 이름·사진으로 온다. 계약: AIStudio server/API.md 의 /api/hooks/notify.

export const AISTUDIO_NOTIFY_DEFAULT_URL = 'https://aistudio.bp-studio.com/api/hooks/notify';

/** 한 장 1.5MB · 합계 2.5MB 가 서버 한도다. 넘는 사진은 JPEG 로 줄여 보낸다. */
const IMAGE_MAX_BYTES = 1_400_000;

export type AistudioLevel = 'info' | 'success' | 'warning' | 'error';

export type AistudioImage = { name: string; data: Uint8Array };

export type AistudioNotice = {
  title: string;
  body?: string;
  level?: AistudioLevel;
  url?: string;
  images?: AistudioImage[];
  dedupeKey?: string;
  dedupeMinutes?: number;
  push?: boolean;
  quiet?: boolean;
};

export type AistudioNotifyResult = { notification_id?: string; deduped?: boolean; push?: boolean; image_notes?: string[] };

async function fitImage(image: AistudioImage): Promise<{ name: string; data: string }> {
  let { name, data } = image;
  if (data.byteLength > IMAGE_MAX_BYTES) {
    try {
      const { default: sharp } = await import('sharp');
      for (const quality of [80, 65, 50]) {
        const jpeg = await sharp(Buffer.from(data)).jpeg({ quality }).toBuffer();
        data = new Uint8Array(jpeg);
        name = name.replace(/\.\w+$/, '') + '.jpg';
        if (data.byteLength <= IMAGE_MAX_BYTES) break;
      }
    } catch {
      /* 줄이지 못하면 그대로 보낸다. 서버가 붙이지 못한 사진은 알림 본문에 적어 준다 */
    }
  }
  return { name, data: Buffer.from(data).toString('base64') };
}

export async function notifyAistudio(notice: AistudioNotice, env: NodeJS.ProcessEnv = process.env): Promise<AistudioNotifyResult> {
  const token = env.AISTUDIO_NOTIFY_TOKEN?.trim();
  if (!token) throw new Error('AISTUDIO_NOTIFY_TOKEN 환경변수가 필요하다.');
  const endpoint = env.AISTUDIO_NOTIFY_URL?.trim() || AISTUDIO_NOTIFY_DEFAULT_URL;

  const payload: Record<string, unknown> = {
    title: notice.title.replace(/\s+/g, ' ').trim().slice(0, 200),
    level: notice.level ?? 'info',
  };
  if (notice.body) payload.body = notice.body.slice(0, 4000);
  if (notice.url) payload.url = notice.url;
  if (notice.images?.length) payload.images = await Promise.all(notice.images.slice(0, 3).map(fitImage));
  if (notice.dedupeKey) payload.dedupe_key = notice.dedupeKey.slice(0, 200);
  if (notice.dedupeMinutes) payload.dedupe_minutes = notice.dedupeMinutes;
  if (notice.push !== undefined) payload.push = notice.push;
  if (notice.quiet) payload.quiet = true;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`AIStudio 알림 실패: ${res.status} ${text}`.slice(0, 500));
  try {
    return JSON.parse(text) as AistudioNotifyResult;
  } catch {
    throw new Error(`AIStudio 알림 응답이 JSON 이 아니다: ${text.slice(0, 200)}`);
  }
}
