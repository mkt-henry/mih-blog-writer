#!/usr/bin/env node
// 원고 HTML 기계 검증 CLI.
//   node scripts/check-article.mjs "<html-path>" [--type person|category]
// 인물 원고는 발행 전 체크리스트의 기계 검증 항목을 확인하고,
// 하드 실패가 1건 이상이면 exit 1.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { runPersonChecks } from './lib/article-checks.mjs';
import { parseArticlePath } from './lib/parse-article-path.js';

const args = process.argv.slice(2);
const typeFlag = (() => {
  const i = args.indexOf('--type');
  return i >= 0 ? args[i + 1] : null;
})();
const pathArg = args.find((a) => !a.startsWith('--') && a !== typeFlag);

if (!pathArg) {
  console.error('사용법: node scripts/check-article.mjs "<html-path>" [--type person|category]');
  process.exit(2);
}
const full = resolve(pathArg);
if (!existsSync(full)) {
  console.error(`파일을 찾지 못함: ${full}`);
  process.exit(2);
}

const html = readFileSync(full, 'utf8');
const parsed = parseArticlePath(pathArg);
const title = parsed?.title;

// 타입 판별: 플래그 우선 → 본문 이미지 있으면 person, 없으면 category
const hasImg = /<img\b/i.test(html);
const type = typeFlag || (hasImg ? 'person' : 'category');

if (type === 'category') {
  console.log(`[check-article] 카테고리 원고로 판별 — 이미지 검사 생략.`);
  console.log(`(카테고리 전용 검증은 04 지침 기반으로 추후 추가 예정)`);
  process.exit(0);
}

const findings = runPersonChecks(html, { title });
const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');

console.log(`\n📋 원고 검증 — ${pathArg}`);
console.log(`타입: 인물 원고 | 제목: ${title ?? '(경로 파싱 실패)'}\n`);

if (fails.length === 0) console.log('✅ 하드 검사 전부 통과');
for (const f of fails) console.log(`❌ ${f.id}: ${f.message}`);
for (const w of warns) console.log(`⚠️  ${w.id}: ${w.message}`);

console.log(`\n요약: 실패 ${fails.length} · 경고 ${warns.length}`);
process.exit(fails.length > 0 ? 1 : 0);
