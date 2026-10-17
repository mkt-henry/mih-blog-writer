// usage (repo root): node .claude/skills/naver-schedule-publish/scripts/send-aistudio.mjs [--test] [--no-discord|--discord-only] "<제목>" ["<본문>"] a.png b.png ...
//        연결 확인만(아무것도 보내지 않음): node .../send-aistudio.mjs --check
// 예약 목록 캡처를 AIStudio 알림(Owner 휴대폰 푸시 + 알림함, MIH 프로젝트 이름·사진)으로 보내고,
// 같은 캡처를 Discord "신규 원고 알림" 채널에도 보낸다.
//   2026-10-05 Discord → AIStudio, 2026-10-06 Owner: "당분간은 mih 는 디코로도 알림이 왔으면 좋겠어" → 둘 다 보낸다. 지우지 말 것.
// 토큰·주소: .env.local 의 AISTUDIO_NOTIFY_TOKEN (AIStudio 토큰 label mih-windows), AISTUDIO_NOTIFY_URL,
//            DISCORD_NEW_ARTICLE_WEBHOOK_URL (Discord 신규 원고 알림 채널). 이 값을 지우면 Discord 만 꺼진다.
// AIStudio: 사진은 알림 하나에 3장까지라 넘으면 "제목 (1/2)", "제목 (2/2)"로 나눠 보내고 푸시는 첫 알림만 한다.
// Discord: 예전 send-discord.mjs 와 같이 메시지 하나에 사진을 모두(10장까지) 붙인다.
// 두 곳은 따로 보낸다 — 한쪽이 실패해도 다른 쪽은 나가고, 실패가 있으면 끝에 종료 코드 1.
// --test 면 AIStudio 에만 [테스트] 제목·푸시 없이 보낸다(Discord 로는 보내지 않는다).
// 2026-10-17 Owner: 사이트 앱(mih.bp-studio.com/alerts, PWA 푸시)에도 Discord 와 같은 글·사진을 남긴다.
//   Discord 와 같은 조건(--test·--no-discord 면 안 남김)이고 웹훅이 꺼져 있어도 남긴다. 사진은 R2(alerts/)에 가로 1080px 로 올린다.
//   .env.local 의 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY·R2_* 를 쓴다. --no-app 이면 사이트에는 남기지 않는다.
import { readFileSync, existsSync } from 'fs';
import { basename, extname, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}
const token = process.env.AISTUDIO_NOTIFY_TOKEN;
const endpoint = process.env.AISTUDIO_NOTIFY_URL || 'https://aistudio.bp-studio.com/api/hooks/notify';
const discordWebhook = (process.env.DISCORD_NEW_ARTICLE_WEBHOOK_URL || '').trim();

let args = process.argv.slice(2);
const flags = new Set();
while (args[0]?.startsWith('--')) flags.add(args.shift());
const test = flags.has('--test');

if (flags.has('--check')) {
  // 보내지 않고 설정만 확인한다: AIStudio 토큰이 있는지, Discord 웹훅이 살아 있는지(GET).
  console.log('AIStudio 토큰', token ? '있음' : '없음');
  if (!discordWebhook) console.log('Discord 웹훅 없음 — Discord 꺼짐');
  else {
    const r = await fetch(discordWebhook, { signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    console.log('Discord 웹훅', r.status, j.name ?? '');
  }
  process.exit(0);
}

const toAistudio = !flags.has('--discord-only');
const toDiscord = !flags.has('--no-discord') && !test;
const toApp = toDiscord && !flags.has('--no-app');

const isImage = (a) => /\.(png|jpe?g|webp)$/i.test(a) && existsSync(a);
const [title, ...rest] = args;
if (!title) throw new Error('제목이 필요하다');
const body = rest.length && !isImage(rest[0]) ? rest.shift() : '';
const files = rest.filter((f) => {
  if (isImage(f)) return true;
  console.error('사진이 아니거나 없는 파일이라 뺀다:', f);
  return false;
});

const mime = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
const failures = [];

async function sendAistudio() {
  if (!token) throw new Error('AISTUDIO_NOTIFY_TOKEN 이 .env.local 에 없다');
  const groups = [];
  for (let i = 0; i < files.length; i += 3) groups.push(files.slice(i, i + 3));
  if (groups.length === 0) groups.push([]);

  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const key = `${test ? 'test-' : ''}naver-schedule-publish-${day}-${title}`.slice(0, 180);
  for (const [i, group] of groups.entries()) {
    const n = groups.length;
    const payload = {
      title: `${test ? '[테스트] ' : ''}${title}${n > 1 ? ` (${i + 1}/${n})` : ''}`.slice(0, 200),
      level: 'success',
      dedupe_key: n > 1 ? `${key}#${i + 1}/${n}` : key,
      dedupe_minutes: 1440,
      images: group.map((f) => ({ name: basename(f), data: `data:image/${mime[extname(f).toLowerCase()]};base64,` + readFileSync(f).toString('base64') })),
    };
    if (i === 0 && body) payload.body = body.slice(0, 4000);
    if (test || i > 0) payload.push = false;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`AIStudio 알림 실패 ${res.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    console.log(res.status, j.notification_id, group.length, (j.image_notes || []).join(' / '));
  }
}

/** Discord 로 나가는 글: "📅 **10/5 예약 발행 완료** — …" + 본문. 사이트 알림도 같은 글을 쓴다. */
function discordContent() {
  const dash = title.indexOf(' — ');
  const head = dash > 0 ? `${title.slice(0, dash).replace(/^(\S+)\s+/, '$1 **')}**${title.slice(dash)}` : title;
  return (body ? `${head}\n${body}` : head).slice(0, 2000);
}

async function sendApp() {
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) throw new Error('사이트 알림: SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없다');
  // 저장소 루트의 이미지 저장소 모듈(R2 업로드·축소·9.5GB 가드)을 그대로 쓴다.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const store = await import(pathToFileURL(join(repoRoot, 'scripts', 'lib', 'image-store.mjs')).href);
  const images = [];
  if (store.backend() === 'r2') {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    for (const f of files.slice(0, 10)) {
      const buf = await store.shrink(readFileSync(f), { width: 1080, quality: 82 });
      const key = `alerts/${day}/${Math.random().toString(36).slice(2, 10)}.jpg`;
      await store.putR2(key, buf);
      images.push({ url: store.publicUrl(key), name: basename(f) });
    }
  } else if (files.length) console.log('사이트 알림: R2_* 가 없어 사진 없이 글만 남긴다');
  const res = await fetch(`${sbUrl}/rest/v1/mih_alerts`, {
    method: 'POST',
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ channel: 'schedule', payload: { content: discordContent() }, images }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`사이트 알림 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log('app', res.status, images.length);
}

async function sendDiscord() {
  // 예전 형식: "📅 **10/5 예약 발행 완료** — 4계정 × 3편 (08:00 · 08:30 · 09:00)" + 캡처 사진.
  const content = discordContent();
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content }));
  files.slice(0, 10).forEach((f, i) => {
    const type = `image/${mime[extname(f).toLowerCase()]}`;
    fd.append(`files[${i}]`, new Blob([readFileSync(f)], { type }), basename(f));
  });
  const res = await fetch(discordWebhook, { method: 'POST', body: fd, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Discord 전송 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log('discord', res.status, Math.min(files.length, 10));
}

if (toAistudio) {
  try { await sendAistudio(); } catch (e) { failures.push(e.message); console.error(e.message); }
}
if (toDiscord) {
  if (!discordWebhook) console.log('discord 건너뜀 — .env.local 에 DISCORD_NEW_ARTICLE_WEBHOOK_URL 이 없다(꺼짐)');
  else {
    try { await sendDiscord(); } catch (e) { failures.push(e.message); console.error(e.message); }
  }
}
if (toApp) {
  try { await sendApp(); } catch (e) { failures.push(e.message); console.error(e.message); }
}
if (failures.length) process.exit(1);
