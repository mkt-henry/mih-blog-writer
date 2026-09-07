// scripts/fix-keyword-category.mjs
// keywords.category 를 artsro CatNo 기준으로 바로잡는다.
//
// 초기 크롤러가 "강연자/개그맨/방송인이 아니면 전부 가수"로 떨어뜨려서
// 마술사·마임팀·국악팀·댄스팀·기획공연이 모두 `가수` 로 저장돼 있었다.
// 판정 기준은 lib/artsro-categories.mjs 단일 매핑이다.
//
// 사용법:
//   node scripts/fix-keyword-category.mjs            # dry-run (쓰기 없음)
//   node scripts/fix-keyword-category.mjs --apply     # 실제 반영
//   node scripts/fix-keyword-category.mjs --list       # 바뀌는 행 전체 나열

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.js';
import { fetchAll } from '../lib/name-match.mjs';
import { catNoFromSource, classifyCatNo } from '../lib/artsro-categories.mjs';

loadEnv();

const apply = process.argv.includes('--apply');
const listAll = process.argv.includes('--list');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const rows = await fetchAll(sb, 'keywords', 'id,keyword,category,agency,source');

const changes = [];
const unknown = [];
let noCatNo = 0;

for (const r of rows) {
  const catNo = catNoFromSource(r.source);
  if (catNo === null) { noCatNo++; continue; }
  const { category } = classifyCatNo(catNo);
  if (category === null) { unknown.push({ ...r, catNo }); continue; }
  if (category !== r.category) changes.push({ ...r, catNo, from: r.category, to: category });
}

console.log(`전체 ${rows.length}건 / CatNo 없는 행 ${noCatNo}건(다른 출처) / 판정 대상 ${rows.length - noCatNo}건`);
console.log(`바로잡을 행: ${changes.length}건`);

if (unknown.length) {
  console.log(`\n⚠️  매핑에 없는 CatNo ${unknown.length}건 — lib/artsro-categories.mjs 에 추가 필요`);
  const byNo = {};
  for (const u of unknown) byNo[u.catNo] = (byNo[u.catNo] ?? 0) + 1;
  console.log('  ' + Object.entries(byNo).map(([n, c]) => `CatNo=${n}:${c}건`).join(' '));
}

const buckets = {};
for (const c of changes) {
  const k = `${c.from ?? '(null)'} → ${c.to}`;
  (buckets[k] ??= []).push(c);
}
console.log('\n=== 변경 요약 ===');
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
  const 예 = v.slice(0, 4).map((c) => `${c.keyword}(${c.catNo})`).join(', ');
  console.log(`  ${String(v.length).padStart(4)}건  ${k}    예: ${예}`);
}

if (listAll) {
  console.log('\n=== 전체 목록 ===');
  for (const c of changes) console.log(`  ${c.id}  ${c.keyword}  [${c.from} → ${c.to}]  CatNo=${c.catNo}`);
}

if (!apply) {
  console.log('\ndry-run 이다. 실제 반영은 --apply 를 붙인다.');
  process.exit(0);
}

// category 만 바꾼다. agency 는 건드리지 않는다 —
// 이미 배정된 계정을 흔들면 발행 이력과 후보 풀이 어긋난다.
let done = 0;
for (const c of changes) {
  const { error } = await sb.from('keywords').update({ category: c.to }).eq('id', c.id);
  if (error) { console.error(`  ✗ ${c.id} ${c.keyword}: ${error.message}`); continue; }
  done++;
  if (done % 100 === 0) console.log(`  ... ${done}/${changes.length}`);
}
console.log(`\n✓ ${done}/${changes.length}건 반영`);
