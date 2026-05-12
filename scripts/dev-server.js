/**
 * MIH dev server
 *
 * output/ 정적 파일 서빙 + 키워드 데이터 영속화 API.
 *
 * 실행: npm run dev
 * 포트: 3000 고정 (점유 시 오류 종료 — origin 분리 방지)
 *       PORT 환경변수로 오버라이드 가능
 */

import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const STATIC_DIR = join(ROOT, 'output');
const KEYWORDS_FILE = join(STATIC_DIR, 'keywords.json');
const MANIFEST_FILE = join(STATIC_DIR, 'manifest.js');
const PORT = Number(process.env.PORT) || 4321;
const RSS_TTL_MS = 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.txt':  'text/plain; charset=utf-8',
};

// ── 키워드 파일 입출력 ──────────────────────────────────────────────────────
async function readKeywords() {
  try {
    const raw = await readFile(KEYWORDS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('keywords.json is not an array');
    return arr;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeKeywords(arr) {
  // tmp 파일에 먼저 쓰고 rename → 부분 쓰기로 본 파일 손상되는 일 방지
  const tmp = KEYWORDS_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
  await rename(tmp, KEYWORDS_FILE);
}

function validateKeywordsBody(body) {
  if (!Array.isArray(body)) return '키워드는 배열이어야 합니다';
  for (let i = 0; i < body.length; i++) {
    const item = body[i];
    if (!item || typeof item !== 'object') return `[${i}] 객체여야 합니다`;
    if (typeof item.id !== 'string' || !item.id) return `[${i}] id 누락`;
    if (typeof item.keyword !== 'string' || !item.keyword) return `[${i}] keyword 누락`;
    if (typeof item.category !== 'string' || !item.category) return `[${i}] category 누락`;
  }
  return null;
}

// ── manifest 로드 (agency 목록) ─────────────────────────────────────────────
async function loadAgencies() {
  const raw = await readFile(MANIFEST_FILE, 'utf8');
  const json = raw
    .replace(/^\/\/[^\n]*\n/, '')
    .replace(/^window\.MIH\s*=\s*/, '')
    .replace(/;\s*$/, '');
  const data = JSON.parse(json);
  return data.agencies || {};
}

// ── RSS 캐시 & fetch ─────────────────────────────────────────────────────
// Map<agencySlug, { items, fetchedAt, error }>
const rssCache = new Map();

function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = (
      body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ??
      body.match(/<title>(.*?)<\/title>/)
    )?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

async function fetchAgencyRss(blogSlug) {
  const url = `https://rss.blog.naver.com/${blogSlug}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-Dev/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

async function getRssEntry(slug, blogSlug) {
  const cached = rssCache.get(slug);
  if (cached && !cached.error && Date.now() - cached.fetchedAt < RSS_TTL_MS) {
    return cached;
  }
  try {
    const items = await fetchAgencyRss(blogSlug);
    const entry = { items, fetchedAt: Date.now(), error: null };
    rssCache.set(slug, entry);
    return entry;
  } catch (e) {
    const entry = { items: [], fetchedAt: Date.now(), error: e.message };
    rssCache.set(slug, entry);
    return entry;
  }
}

// ── HTTP 응답 헬퍼 ─────────────────────────────────────────────────────────
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readBody(req, max = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ── 라우트 핸들러 ──────────────────────────────────────────────────────────
async function handleApiKeywords(req, res) {
  if (req.method === 'GET') {
    try {
      const arr = await readKeywords();
      sendJson(res, 200, arr);
    } catch (e) {
      console.error('[GET /api/keywords] error:', e);
      sendJson(res, 500, { error: 'read failed', message: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const ctype = req.headers['content-type'] || '';
    if (!ctype.includes('application/json')) {
      sendJson(res, 415, { error: 'Content-Type must be application/json' });
      return;
    }
    let parsed;
    try {
      const raw = await readBody(req);
      parsed = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { error: 'invalid JSON', message: e.message });
      return;
    }
    const err = validateKeywordsBody(parsed);
    if (err) {
      sendJson(res, 400, { error: 'validation failed', message: err });
      return;
    }
    try {
      await writeKeywords(parsed);
      console.log(`[POST /api/keywords] ${parsed.length} items saved`);
      sendJson(res, 200, { ok: true, count: parsed.length });
    } catch (e) {
      console.error('[POST /api/keywords] write error:', e);
      sendJson(res, 500, { error: 'write failed', message: e.message });
    }
    return;
  }

  res.writeHead(405, { 'Allow': 'GET, POST' });
  res.end();
}

async function handleApiRss(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Allow': 'GET' });
    res.end();
    return;
  }
  let agencies;
  try {
    agencies = await loadAgencies();
  } catch (e) {
    console.error('[GET /api/rss] manifest load failed:', e);
    sendJson(res, 500, { error: 'manifest 로드 실패', message: e.message });
    return;
  }
  const slugs = Object.keys(agencies);
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      const info = agencies[slug] || {};
      const blogSlug = info.blogSlug || slug;
      const entry = await getRssEntry(slug, blogSlug);
      return [slug, entry];
    })
  );
  console.log(`[GET /api/rss] ${slugs.length} agencies (` +
    slugs.map(s => `${s}:${rssCache.get(s)?.error ? 'err' : (rssCache.get(s)?.items.length || 0)}`).join(', ') + ')');
  sendJson(res, 200, Object.fromEntries(entries));
}

async function handleStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    res.end();
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const target = resolve(join(STATIC_DIR, urlPath));
  if (!target.startsWith(STATIC_DIR + (process.platform === 'win32' ? '\\' : '/')) && target !== STATIC_DIR) {
    res.writeHead(403).end();
    return;
  }

  try {
    const data = await readFile(target);
    const ext = extname(target).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } else {
      console.error('[GET static] error:', e);
      res.writeHead(500).end();
    }
  }
}

// ── 서버 ─────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const t0 = Date.now();
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/keywords') {
      await handleApiKeywords(req, res);
    } else if (url.pathname === '/api/rss') {
      await handleApiRss(req, res);
    } else {
      await handleStatic(req, res);
    }
  } catch (e) {
    console.error('[server] unhandled:', e);
    if (!res.headersSent) res.writeHead(500).end();
  } finally {
    const ms = Date.now() - t0;
    console.log(`${req.method} ${req.url} ${res.statusCode} (${ms}ms)`);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n포트 ${PORT} 이 이미 사용 중입니다. (다른 dev server 실행 중?)`);
    console.error(`PORT=다른포트 npm run dev 로 오버라이드하세요.\n`);
  } else {
    console.error('server error:', e);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`MIH dev server running at http://localhost:${PORT}`);
  console.log(`  static: ${STATIC_DIR}`);
  console.log(`  data:   ${KEYWORDS_FILE}`);
});
