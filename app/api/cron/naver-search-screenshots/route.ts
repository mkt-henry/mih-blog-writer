import { NextResponse } from 'next/server';
import { runDailyNaverScreenshotJob } from '@/lib/naver-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  // 스케줄 주체는 Supabase pg_cron 이다(다른 잡들과 한곳에서 관리). 그쪽은 service role key 로
  // 부르고, Vercel 크론이나 수동 호출은 CRON_SECRET 으로 부른다. 둘 다 받는다.
  const allowed = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET].filter(Boolean);
  if (allowed.length === 0) {
    return NextResponse.json({ error: 'no cron auth configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!allowed.some((secret) => auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const webhookUrl = process.env.NAVER_SEARCH_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: 'NAVER_SEARCH_DISCORD_WEBHOOK_URL not set' }, { status: 500 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  try {
    const summary = await runDailyNaverScreenshotJob({ webhookUrl, date });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
