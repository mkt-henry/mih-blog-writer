// 왜 아예 안 뜨나 — 측정·시간·계정·경쟁·중복·검색어·접근성·문서를 한 번에 훑는 진단. `npm run why:unexposed`
// 2026-09-05 첫 실행 결과와 해석은 메모리 project_unexposed_causes 에 있다. 재측정할 때 이 자로 같은 표를 다시 뽑는다.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { strip, FEATURES } from './lib/gate-features.mjs';
import { cosine, openCache } from './lib/embed.mjs';
import { searchName } from '../lib/name-match.mjs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function page(t, c, mod = (q) => q) { let rows = [], from = 0; for (;;) { const { data, error } = await mod(db.from(t).select(c)).range(from, from + 999); if (error) throw new Error(error.message); rows = rows.concat(data); if (data.length < 1000) break; from += 1000; } return rows; }
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(0)}%` : '-');
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstHour = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).getUTCHours();
const canon = (u) => String(u).split('?')[0].replace(/\/$/, '');
const SLUG = { mih_speaker: 'mih_speaker', mih_agency: 'mih_agency', mih_casting: 'mih_casting', other: 'kyh620303' };
const OURS = new Set([...Object.values(SLUG), 'gdfdhzgfgfhgdj']);

const arts = new Map((await page('articles', 'id,agency,person_name,title,published_at,published_url,published_source,reserved_at,category,html_content')).filter((a) => a.published_at).map((a) => [a.id, a]));
const checks = await page('mih_serp_checks', 'article_id,indexed,rank,surface,competitors,query,checked_on,note');
const kpi = checks.filter((c) => c.article_id && arts.has(c.article_id));
const harv = checks.filter((c) => !c.article_id && c.surface === 'pc-total');
const docs = await page('mih_serp_docs', 'url,is_ours,status,note,blog_id');

// 원고별 요약
const A = new Map();
for (const c of kpi) {
  const a = arts.get(c.article_id);
  const s = A.get(c.article_id) ?? { a, pc: [], bt: [], q: c.query };
  const off = Math.round((Date.parse(c.checked_on) - Date.parse(kst(a.published_at))) / 86400e3);
  (c.surface === 'pc-total' ? s.pc : s.bt).push({ off, idx: c.indexed, rank: c.rank, comp: c.competitors ?? [], note: c.note });
  A.set(c.article_id, s);
}
const all = [...A.values()].filter((s) => s.pc.length >= 2);
const ever = all.filter((s) => s.pc.some((o) => o.idx)), never = all.filter((s) => !s.pc.some((o) => o.idx));
console.log(`\n■ 표본: 통합검색 관측 2회 이상 원고 ${all.length}편 — 한 번이라도 뜬 글 ${ever.length} · 한 번도 못 뜬 글 ${never.length} (${pct(never.length, all.length)})`);
const cmp = (label, fn, fmt = (x) => x) => console.log(`  ${label.padEnd(30)} 뜬 글 ${String(fmt(fn(ever))).padStart(8)}   못 뜬 글 ${String(fmt(fn(never))).padStart(8)}`);

// 1. 측정 자체
console.log('\n■ 1. 측정이 멀쩡한가 — 통합검색 관측 중 "블로그 링크 0개"(note=no-blog-results) 비율');
const pcObs = kpi.filter((c) => c.surface === 'pc-total');
console.log(`  관측 ${pcObs.length}건 · 블로그 링크 0개 ${pct(pcObs.filter((c) => c.note === 'no-blog-results').length, pcObs.length)} · 미노출 관측 중 링크 0개 ${pct(pcObs.filter((c) => !c.indexed && c.note === 'no-blog-results').length, pcObs.filter((c) => !c.indexed).length)}`);
const compLen = pcObs.filter((c) => !c.indexed).map((c) => (c.competitors ?? []).length); const h = {}; for (const n of compLen) h[n] = (h[n] || 0) + 1;
console.log(`  미노출 관측의 경쟁 링크 수 분포: ${Object.entries(h).sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}개:${v}`).join(' ')}`);
console.log(`  못 뜬 글 중 모든 관측이 링크 0개인 원고: ${never.filter((s) => s.pc.every((o) => o.note === 'no-blog-results')).length}편`);

// 2. 시간 — D+N 별 노출률, 전환
console.log('\n■ 2. 시간 — 발행 후 며칠째에 뜨나 (통합검색 / 블로그탭)');
for (const off of [1, 3, 7, 14, 30]) {
  const pc = kpi.filter((c) => c.surface === 'pc-total' && Math.abs(Math.round((Date.parse(c.checked_on) - Date.parse(kst(arts.get(c.article_id).published_at))) / 86400e3) - off) <= (off >= 14 ? 2 : 0));
  const bt = kpi.filter((c) => c.surface === 'blog-tab' && Math.abs(Math.round((Date.parse(c.checked_on) - Date.parse(kst(arts.get(c.article_id).published_at))) / 86400e3) - off) <= (off >= 14 ? 2 : 0));
  console.log(`  D+${String(off).padEnd(3)} 통합 ${pct(pc.filter((c) => c.indexed).length, pc.length).padStart(4)} (${pc.length}건)   블로그탭 ${pct(bt.filter((c) => c.indexed).length, bt.length).padStart(4)} (${bt.length}건)`);
}
const first = (s) => s.pc.sort((x, y) => x.off - y.off)[0];
console.log(`  뜬 글 중 첫 관측(D+1)부터 떠 있던 글 ${pct(ever.filter((s) => first(s).idx).length, ever.length)} · 나중에 뜬 글 ${pct(ever.filter((s) => !first(s).idx).length, ever.length)}`);
console.log(`  뜬 글 중 마지막 관측에서 사라진 글 ${pct(ever.filter((s) => !s.pc[s.pc.length - 1].idx).length, ever.length)}`);

// 3. 블로그탭에서는 어디 있나
console.log('\n■ 3. 못 뜬 글은 블로그탭에는 있나');
const btRank = (s) => { const r = s.bt.filter((o) => o.idx).map((o) => o.rank); return r.length ? Math.min(...r) : null; };
const bucket = (r) => (r == null ? '없음' : r <= 3 ? '1~3위' : r <= 7 ? '4~7위' : '8위↓');
for (const [label, set] of [['뜬 글', ever], ['못 뜬 글', never]]) {
  const b = {}; for (const s of set) { const k = bucket(btRank(s)); b[k] = (b[k] || 0) + 1; }
  console.log(`  ${label.padEnd(8)} 블로그탭 최고 순위: ${['1~3위', '4~7위', '8위↓', '없음'].map((k) => `${k} ${pct(b[k] || 0, set.length)}`).join(' · ')}`);
}

// 4. 계정·발행 패턴
console.log('\n■ 4. 계정·발행 패턴');
const byAg = {}; for (const s of all) { const k = s.a.agency; byAg[k] ??= { n: 0, e: 0 }; byAg[k].n++; if (ever.includes(s)) byAg[k].e++; }
console.log(`  계정별 한 번이라도 뜬 비율: ${Object.entries(byAg).map(([k, v]) => `${k} ${pct(v.e, v.n)} (${v.n})`).join(' · ')}`);
const perDay = new Map(); for (const a of arts.values()) { const k = `${a.agency}|${kst(a.published_at)}`; perDay.set(k, (perDay.get(k) || 0) + 1); }
const load = (s) => perDay.get(`${s.a.agency}|${kst(s.a.published_at)}`);
cmp('같은 날 같은 계정 발행 수(중앙값)', (set) => med(set.map(load)));
const byLoad = {}; for (const s of all) { const k = load(s) <= 1 ? '1편' : load(s) <= 2 ? '2편' : load(s) <= 3 ? '3편' : '4편↑'; byLoad[k] ??= { n: 0, e: 0 }; byLoad[k].n++; if (ever.includes(s)) byLoad[k].e++; }
console.log(`  하루 발행 수별 노출: ${['1편', '2편', '3편', '4편↑'].filter((k) => byLoad[k]).map((k) => `${k} ${pct(byLoad[k].e, byLoad[k].n)} (${byLoad[k].n})`).join(' · ')}`);
const byHour = {}; for (const s of all) { const hh = kstHour(s.a.published_at); const k = hh < 9 ? '~09시' : hh < 12 ? '09~12' : hh < 18 ? '12~18' : '18시~'; byHour[k] ??= { n: 0, e: 0 }; byHour[k].n++; if (ever.includes(s)) byHour[k].e++; }
console.log(`  발행 시각별 노출: ${Object.entries(byHour).map(([k, v]) => `${k} ${pct(v.e, v.n)} (${v.n})`).join(' · ')}`);
const bySrc = {}; for (const s of all) { const k = `${s.a.published_source ?? 'null'}${s.a.reserved_at ? '+예약' : ''}`; bySrc[k] ??= { n: 0, e: 0 }; bySrc[k].n++; if (ever.includes(s)) bySrc[k].e++; }
console.log(`  발행 경로별 노출: ${Object.entries(bySrc).map(([k, v]) => `${k} ${pct(v.e, v.n)} (${v.n})`).join(' · ')}`);
const byCat = {}; for (const s of all) { const k = s.a.category ? '카테고리 원고' : '인물 원고'; byCat[k] ??= { n: 0, e: 0 }; byCat[k].n++; if (ever.includes(s)) byCat[k].e++; }
console.log(`  원고 유형별 노출: ${Object.entries(byCat).map(([k, v]) => `${k} ${pct(v.e, v.n)} (${v.n})`).join(' · ')}`);
// 발행 주별 (계정 건강 추세)
const byWeek = {}; for (const s of all) { const d = new Date(kst(s.a.published_at)); const k = kst(new Date(d.getTime() - d.getUTCDay() * 86400e3).toISOString()); byWeek[k] ??= { n: 0, e: 0 }; byWeek[k].n++; if (ever.includes(s)) byWeek[k].e++; }
console.log(`  발행 주(週)별 노출: ${Object.entries(byWeek).sort().map(([k, v]) => `${k.slice(5)} ${pct(v.e, v.n)}(${v.n})`).join(' · ')}`);

// 5. 경쟁 — 그 검색어의 판
console.log('\n■ 5. 경쟁 — 그 검색어에 누가 있나');
const app = new Map(); for (const c of harv) for (const k of c.competitors ?? []) if (k?.slug) app.set(k.slug, (app.get(k.slug) || 0) + 1);
const serpOf = (q) => { const rows = harv.filter((c) => c.query === q); return rows.length ? rows.sort((x, y) => (y.competitors?.length ?? 0) - (x.competitors?.length ?? 0))[0].competitors ?? [] : null; };
const lastComp = (s) => s.pc.filter((o) => o.comp.length).slice(-1)[0]?.comp ?? [];
cmp('통합검색 경쟁 링크 수(마지막 관측)', (set) => med(set.map((s) => lastComp(s).length)));
cmp('경쟁 블로그 강도(등장 횟수 중앙값)', (set) => med(set.flatMap((s) => lastComp(s).slice(0, 5).map((k) => app.get(k.slug) ?? 0))));
cmp('상위 5 경쟁 중 "큰 블로그"(등장 20회↑) 수', (set) => med(set.map((s) => lastComp(s).slice(0, 5).filter((k) => (app.get(k.slug) ?? 0) >= 20).length)));
const oursInSerp = (s) => lastComp(s).some((k) => OURS.has(k.slug));   // KPI 는 경쟁 목록에서 우리를 빼므로 항상 false — 수집분으로 본다
const oursInHarv = (s) => (serpOf(s.q) ?? []).some((k) => OURS.has(k.slug) && k.slug !== SLUG[s.a.agency]);
console.log(`  같은 검색어에 우리 다른 계정 글이 떠 있는 경우: 뜬 글 ${pct(ever.filter(oursInHarv).length, ever.length)} · 못 뜬 글 ${pct(never.filter(oursInHarv).length, never.length)} (수집 시점 기준)`);
const noSerp = never.filter((s) => serpOf(s.q) === null).length; console.log(`  못 뜬 글 중 검색어 수집 기록이 없는 원고 ${noSerp}편`);

// 6. 중복 — 같은 인물 여러 원고, 우리 글끼리 유사도, 제목 틀
console.log('\n■ 6. 중복');
const byPerson = new Map(); for (const a of arts.values()) { const k = searchName(a.person_name); byPerson.set(k, [...(byPerson.get(k) ?? []), a]); }
const dup = (s) => (byPerson.get(searchName(s.a.person_name)) ?? []).length >= 2;
console.log(`  같은 인물로 원고가 2편 이상: 뜬 글 ${pct(ever.filter(dup).length, ever.length)} · 못 뜬 글 ${pct(never.filter(dup).length, never.length)}`);
const dupPairs = [...byPerson.values()].filter((l) => l.length >= 2 && l.every((a) => A.has(a.id) && A.get(a.id).pc.length >= 2));
let both = 0, one = 0, none = 0; for (const l of dupPairs) { const e = l.filter((a) => A.get(a.id).pc.some((o) => o.idx)).length; if (e === l.length) both++; else if (e) one++; else none++; }
console.log(`  중복 인물 ${dupPairs.length}쌍 중 — 둘 다 뜸 ${both} · 하나만 뜸 ${one} · 둘 다 안 뜸 ${none}`);
const cache = openCache('./.models/cache-Xenova_bge-m3.json');
const vec = (id) => { const m = cache.getMany(`a:${id}`); if (!m) return null; const v = new Array(m[0].length).fill(0); for (const r of m) for (let i = 0; i < v.length; i++) v[i] += r[i] / m.length; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const withVec = all.map((s) => ({ s, v: vec(s.a.id) })).filter((x) => x.v);
const maxSim = (x) => Math.max(...withVec.filter((o) => o !== x && searchName(o.s.a.person_name) !== searchName(x.s.a.person_name)).map((o) => cosine(x.v, o.v)));
const sims = withVec.map((x) => ({ s: x.s, sim: maxSim(x) }));
console.log(`  우리 다른 원고와 최고 유사도(임베딩, ${withVec.length}편): 뜬 글 ${med(sims.filter((x) => ever.includes(x.s)).map((x) => x.sim)).toFixed(3)} · 못 뜬 글 ${med(sims.filter((x) => never.includes(x.s)).map((x) => x.sim)).toFixed(3)}`);
const bracket = (s) => /^\[.+섭외\]/.test(s.a.title ?? '');
console.log(`  제목이 "[인물 섭외]" 틀로 시작: 뜬 글 ${pct(ever.filter(bracket).length, ever.length)} · 못 뜬 글 ${pct(never.filter(bracket).length, never.length)}`);

// 7. 검색어 — 등록명과 다른 검색어로 재었나
console.log('\n■ 7. 검색어');
const mismatch = (s) => s.q !== `${searchName(s.a.person_name)} 섭외`;
console.log(`  기록된 검색어가 한글 표준 검색어와 다른 원고: 뜬 글 ${ever.filter(mismatch).length}편 · 못 뜬 글 ${never.filter(mismatch).length}편`);
const foreign = (s) => /[A-Za-z]/.test(s.a.person_name ?? '');
console.log(`  등록명에 영문이 섞인 원고: 뜬 글 ${pct(ever.filter(foreign).length, ever.length)} · 못 뜬 글 ${pct(never.filter(foreign).length, never.length)}`);

// 8. 접근성 — 우리 글을 네이버에서 받아 올 수 있었나
console.log('\n■ 8. 글 자체가 공개 상태인가 (본문 수집 결과)');
const docByUrl = new Map(docs.map((d) => [canon(d.url), d]));
const st = (s) => { const d = docByUrl.get(canon(s.a.published_url ?? '')); return d ? `${d.status ?? ''}${d.note ? '/' + d.note : ''}` : '미수집'; };
for (const [label, set] of [['뜬 글', ever], ['못 뜬 글', never]]) { const b = {}; for (const s of set) { const k = st(s); b[k] = (b[k] || 0) + 1; } console.log(`  ${label.padEnd(8)} ${Object.entries(b).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`).join(' · ')}`); }

// 9. 문서 — 관문 지표 요약(중앙값)
console.log('\n■ 9. 문서 지표 (중앙값)');
const feat = (s) => { const body = strip(s.a.html_content); return { body, len: body.length, title: s.a.title, person_name: s.a.person_name }; };
const F = new Map(all.map((s) => [s, feat(s)]));
for (const [n, f] of Object.entries(FEATURES)) cmp(n, (set) => med(set.map((s) => f(F.get(s)))), (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)) : '-'));

// 10. 경쟁을 더 파고든다 — D+1 관측 기준
console.log('\n■ 10. 경쟁 세부 — 첫 관측(D+1) 시점 상위 5 경쟁 중 큰 블로그(등장 20회↑) 수별 노출');
const d1 = (s) => s.pc.find((o) => o.off <= 2) ?? s.pc[0];
const bigN = (s) => d1(s).comp.slice(0, 5).filter((k) => (app.get(k.slug) ?? 0) >= 20).length;
const byBig = {}; for (const s of all) { const k = Math.min(bigN(s), 3); byBig[k] ??= { n: 0, e: 0 }; byBig[k].n++; if (d1(s).idx) byBig[k].e++; }
console.log(`  ${[0, 1, 2, 3].filter((k) => byBig[k]).map((k) => `큰 블로그 ${k}${k === 3 ? '+' : ''}개: ${pct(byBig[k].e, byBig[k].n)} (${byBig[k].n}편)`).join(' · ')}`);
const byFor = {}; for (const s of all) { const k = foreign(s) ? '영문 섞인 이름' : '한글 이름'; byFor[k] ??= { n: 0, e: 0 }; byFor[k].n++; if (d1(s).idx) byFor[k].e++; }
console.log(`  이름 유형별 D+1 노출: ${Object.entries(byFor).map(([k, v]) => `${k} ${pct(v.e, v.n)} (${v.n})`).join(' · ')}`);
console.log('  우리 검색어에 가장 자주 나오는 경쟁 블로그 (등장 횟수 · 평균 순위):');
const rankSum = new Map(); for (const c of harv) for (const k of c.competitors ?? []) if (k?.slug && !OURS.has(k.slug)) { const r = rankSum.get(k.slug) ?? { n: 0, r: 0 }; r.n++; r.r += k.rank; rankSum.set(k.slug, r); }
[...rankSum].sort((a, b) => b[1].n - a[1].n).slice(0, 10).forEach(([k, v]) => console.log(`    ${k.padEnd(22)} ${String(v.n).padStart(5)}회   ${(v.r / v.n).toFixed(1)}위`));
const nq = new Set(harv.map((c) => c.query)).size; console.log(`  (수집 검색어 ${nq}개 기준)`);

// 11. 블로그탭 1~3위인데 통합검색엔 없는 글 — 무엇이 다른가
console.log('\n■ 11. 블로그탭 1~3위인데 통합검색에 못 뜬 글 vs 통합검색에 뜬 글 (중앙값)');
const grpB = never.filter((s) => (btRank(s) ?? 99) <= 3), grpA = never.filter((s) => btRank(s) == null || btRank(s) >= 8);
console.log(`  표본: 블로그탭 상위인데 못 뜬 글 ${grpB.length}편 · 블로그탭에도 없거나 8위↓ ${grpA.length}편 · 뜬 글 ${ever.length}편`);
const line = (label, fn, fmt) => console.log(`  ${label.padEnd(16)} 뜬 글 ${fmt(fn(ever)).padStart(7)}   블로그탭上·통합X ${fmt(fn(grpB)).padStart(7)}   블로그탭 없음/8위↓ ${fmt(fn(grpA)).padStart(7)}`);
const f2 = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)) : '-');
for (const n of ['"섭외" 밀도', '인물명 밀도', '인물명 횟수', '본문 길이', '제목 길이']) line(n, (set) => med(set.map((s) => FEATURES[n](F.get(s)))), f2);
line('큰 경쟁 블로그 수', (set) => med(set.map(bigN)), f2);
line('계정 speaker 비율', (set) => set.filter((s) => s.a.agency === 'mih_speaker').length / Math.max(set.length, 1), (x) => pct(x, 1));

// 12. 떴던 글은 얼마나 버티나
console.log('\n■ 12. 떴던 글의 수명 (관측 3회 이상, 마지막으로 떠 있던 날)');
const life = ever.filter((s) => s.pc.length >= 3).map((s) => Math.max(...s.pc.filter((o) => o.idx).map((o) => o.off)));
const lh = {}; for (const l of life) { const k = l <= 1 ? 'D+1까지' : l <= 3 ? 'D+3까지' : l <= 7 ? 'D+7까지' : l <= 14 ? 'D+14까지' : 'D+30까지'; lh[k] = (lh[k] || 0) + 1; }
console.log(`  ${['D+1까지', 'D+3까지', 'D+7까지', 'D+14까지', 'D+30까지'].filter((k) => lh[k]).map((k) => `${k} ${pct(lh[k], life.length)}`).join(' · ')} (${life.length}편, 아직 관측 중인 글 포함)`);

// 13. 우리 회사 다른 블로그가 자리를 차지하나 (이름에 heaven/mha/mih/madein 이 들어간 블로그)
console.log('\n■ 13. 회사 관련 이름의 블로그 — 우리 4계정이 아닌데 우리 검색어에 자주 나오는 것');
const kin = (slug) => /heaven|mha|mih|madein/i.test(slug) && !OURS.has(slug);
[...rankSum].filter(([k]) => kin(k)).sort((a, b) => b[1].n - a[1].n).slice(0, 12).forEach(([k, v]) => console.log(`    ${k.padEnd(22)} ${String(v.n).padStart(5)}회   ${(v.r / v.n).toFixed(1)}위`));
const kinIn = (s) => d1(s).comp.slice(0, 5).some((k) => kin(k.slug));
const withKin = all.filter(kinIn), without = all.filter((s) => !kinIn(s));
console.log(`  D+1 상위 5에 그런 블로그가 있을 때 노출 ${pct(withKin.filter((s) => d1(s).idx).length, withKin.length)} (${withKin.length}편) · 없을 때 ${pct(without.filter((s) => d1(s).idx).length, without.length)} (${without.length}편)`);
const kinCount = (s) => d1(s).comp.slice(0, 5).filter((k) => kin(k.slug)).length;
const bk = {}; for (const s of all) { const k = Math.min(kinCount(s), 3); bk[k] ??= { n: 0, e: 0 }; bk[k].n++; if (d1(s).idx) bk[k].e++; }
console.log(`  개수별: ${[0, 1, 2, 3].filter((k) => bk[k]).map((k) => `${k}${k === 3 ? '+' : ''}개 ${pct(bk[k].e, bk[k].n)} (${bk[k].n})`).join(' · ')}`);
