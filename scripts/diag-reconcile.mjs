/**
 * 종합 검증(읽기 전용): 에이전시별 distinct 섭외 URL을 모두 생존 검사하고
 * live/dead 를 집계, dead URL을 발행행에 매핑. 목표 수치와 대조.
 * 결과를 output/reconcile-report.json 으로 저장.
 */
import { readFileSync, writeFileSync } from 'fs';
function loadEnv() {
  try { const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) { const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/); if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim(); }
  } catch {}
}
loadEnv();
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency', 'other'];
const BLOG = { mih_speaker: 'mih_speaker', mih_casting: 'mih_casting', mih_agency: 'mih_agency', other: 'kyh620303' };
const TARGET = { mih_agency: 100, mih_casting: 103, mih_speaker: 100, other: 21 };

async function selectAll(table, columns) {
  let rows = [], offset = 0; const limit = 1000;
  while (true) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${columns}&limit=${limit}&offset=${offset}`, { headers });
    const b = await res.json(); rows.push(...b);
    if (b.length < limit) break; offset += limit;
  }
  return rows;
}
function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pub = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const pub_ts = pub ? new Date(pub).getTime() : 0;
    if (title && link && pub_ts) items.push({ title, link, pub_ts });
  }
  return items;
}
async function fetchRss(slug) {
  const res = await fetch(`https://rss.blog.naver.com/${BLOG[slug]}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-RSS-Sync/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}
function keyOf(u) {
  try { const url = new URL(u);
    let id, logNo; logNo = url.searchParams.get('logNo');
    if (logNo) id = url.searchParams.get('blogId') || url.pathname.split('/').filter(Boolean)[0];
    else { const p = url.pathname.split('/').filter(Boolean); id = p[0]; logNo = p[1]; }
    return `${id}/${logNo}`;
  } catch { return u.split('?')[0]; }
}
function toMobile(u) {
  try { const url = new URL(u);
    let id, logNo; logNo = url.searchParams.get('logNo');
    if (logNo) id = url.searchParams.get('blogId') || url.pathname.split('/').filter(Boolean)[0];
    else { const p = url.pathname.split('/').filter(Boolean); id = p[0]; logNo = p[1]; }
    return `https://m.blog.naver.com/PostView.naver?blogId=${id}&logNo=${logNo}`;
  } catch { return u; }
}
const isArticle = (t) => /^\s*\[.+?\]/.test(t);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 레이트리밋 내성: 429/5xx/네트워크오류는 지수 백오프로 최대 5회 재시도.
// 삭제 판정은 오직 errorType=noPost 페이지일 때만. 끝까지 확정 못하면 live=null(unknown).
async function probe(u, maxRetry = 5) {
  let delay = 1500;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const res = await fetch(toMobile(u), { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' }, redirect: 'follow' });
      const txt = await res.text();
      const noPost = /errorType=noPost|삭제되었거나 존재하지 않는|존재하지 않는 게시물/.test(txt);
      const hasContent = /se-main-container|se_component|postViewArea/.test(txt);
      if (res.status === 200 && hasContent) return { live: true, status: 200 };
      if (noPost) return { live: false, status: res.status };
      if (res.status === 429 || res.status >= 500 || (res.status === 200 && !hasContent)) {
        // 차단 또는 불완전 응답 → 재시도
        await sleep(delay); delay = Math.min(delay * 2, 20000); continue;
      }
      // 기타 상태 (예: 404 이지만 noPost 아님) → 재시도 후에도 안되면 unknown
      await sleep(delay); delay = Math.min(delay * 2, 20000); continue;
    } catch (e) {
      await sleep(delay); delay = Math.min(delay * 2, 20000);
    }
  }
  return { live: null, status: -1 }; // unknown
}
// 순차 + 요청 간 지연
async function mapPool(items, fn, _conc, gap = 350) {
  const out = new Array(items.length);
  for (let idx = 0; idx < items.length; idx++) {
    out[idx] = await fn(items[idx], idx);
    await sleep(gap);
  }
  return out;
}

const articles = await selectAll('articles', 'id,agency,person_name,title,published_at,published_url,publish_date');
const unmatched = await selectAll('unmatched_rss_items', 'agency,link,title,pub_ts');

const report = {};
for (const s of SLUGS) {
  const pub = articles.filter(a => a.agency === s && a.published_at);
  const um = unmatched.filter(u => u.agency === s);
  let feed = []; try { feed = await fetchRss(s); } catch {}

  const universe = new Map();
  const add = (link, title, src, ref) => {
    if (!link) return; const k = keyOf(link);
    const cur = universe.get(k) ?? { key: k, sampleUrl: link, title, isArticle: isArticle(title), sources: new Set(), pubRows: [] };
    cur.sources.add(src);
    if (ref) cur.pubRows.push(ref);
    if (!cur.title) cur.title = title;
    universe.set(k, cur);
  };
  for (const a of pub) add(a.published_url, a.title, 'pub', { id: a.id, person: a.person_name });
  for (const u of um) add(u.link, u.title, 'unmatched');
  for (const f of feed) add(f.link, f.title, 'feed');

  const all = [...universe.values()].filter(v => v.isArticle);
  const results = await mapPool(all, async (v) => ({ ...await probe(v.sampleUrl), v }));

  const live = results.filter(r => r.live === true);
  const dead = results.filter(r => r.live === false);
  const unknown = results.filter(r => r.live === null);

  // 발행행 기준 dead
  const deadPubRows = [];
  for (const r of dead) for (const ref of r.v.pubRows) deadPubRows.push({ ...ref, title: r.v.title, status: r.status, key: r.v.key });
  const unknownPubRows = [];
  for (const r of unknown) for (const ref of r.v.pubRows) unknownPubRows.push({ ...ref, title: r.v.title, key: r.v.key });

  // live 인데 발행행에 없는 (추가 대상)
  const liveMissing = live.filter(r => !r.v.sources.has('pub')).map(r => ({ key: r.v.key, url: r.v.sampleUrl, title: r.v.title, inFeed: r.v.sources.has('feed') }));
  // dead 인데 발행행에 있음 = 제거 대상은 deadPubRows 그대로

  report[s] = {
    target: TARGET[s],
    distinctArticleUrls: all.length,
    live: live.length,
    dead: dead.length,
    unknown: unknown.length,
    pubRows: pub.length,
    deadPubRows,
    unknownPubRows,
    liveMissing,
  };
  console.log(`\n########## ${s} (목표 ${TARGET[s]}) ##########`);
  console.log(`distinct 섭외 URL ${all.length} → live ${live.length} / dead ${dead.length} / unknown ${unknown.length}`);
  console.log(`발행행 ${pub.length}건 중 dead(삭제글 가리킴): ${deadPubRows.length}건`);
  for (const d of deadPubRows) console.log(`   DEAD id=${d.id.slice(0,8)} [${d.person}] status=${d.status} "${d.title}"`);
  if (unknownPubRows.length) { console.log(`발행행 중 unknown(판정실패, 재확인필요): ${unknownPubRows.length}건`);
    for (const d of unknownPubRows) console.log(`   UNK  id=${d.id.slice(0,8)} [${d.person}] "${d.title}"`); }
  console.log(`live 인데 발행행에 없음(추가 대상): ${liveMissing.length}건`);
  for (const m of liveMissing) console.log(`   MISSING ${m.key} inFeed=${m.inFeed} "${m.title}"`);
  console.log(`==> 검증: live(${live.length}) vs 목표(${TARGET[s]}) => ${live.length === TARGET[s] ? 'OK 일치' : (live.length - TARGET[s]) + ' 차이'}`);
}

writeFileSync('output/reconcile-report.json', JSON.stringify(report, null, 2));
console.log('\n저장: output/reconcile-report.json');
