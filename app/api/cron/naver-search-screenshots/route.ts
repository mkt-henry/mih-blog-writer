import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { runDailyNaverScreenshotJob } from '@/lib/naver-search';

function safeList(dir: string): string[] | string {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    return `ERR: ${(e as Error).message}`;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const webhookUrl = process.env.NAVER_SEARCH_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: 'NAVER_SEARCH_DISCORD_WEBHOOK_URL not set' }, { status: 500 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;
  const debug = url.searchParams.get('debug') === '1';

  if (debug) {
    const candidates = [
      'node_modules/@sparticuz/chromium/bin',
      path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin'),
      '/var/task/node_modules/@sparticuz/chromium/bin',
      '/tmp',
    ];
    const inspection: Record<string, string[] | string> = {};
    for (const c of candidates) inspection[c] = safeList(c);
    return NextResponse.json({ debug: true, cwd: process.cwd(), inspection });
  }

  try {
    const summary = await runDailyNaverScreenshotJob({ webhookUrl, date });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
