/**
 * 오래된 원고 HTML에서 잘못된 카카오 오픈채팅 URL을 올바른 URL로 교체한다.
 * 사용법: node scripts/fix-kakao-url.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const dryRun = process.argv.includes('--dry');
const CORRECT = 'https://open.kakao.com/o/snG6VXti';
const WRONG_RE = /https?:\/\/open\.kakao\.com\/o\/(?!snG6VXti)[a-zA-Z0-9]+/g;

function collectHtmlFiles(dir) {
  const results = [];
  for (const dateEntry of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntry)) continue;
    const datePath = join(dir, dateEntry);
    if (!statSync(datePath).isDirectory()) continue;
    for (const agencyEntry of readdirSync(datePath)) {
      const agencyPath = join(datePath, agencyEntry);
      if (!statSync(agencyPath).isDirectory()) continue;
      for (const file of readdirSync(agencyPath)) {
        if (!file.endsWith('.html')) continue;
        results.push(join(datePath, agencyEntry, file));
      }
    }
  }
  return results;
}

const files = collectHtmlFiles('output');
let fixedFiles = 0;

for (const file of files) {
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  if (!WRONG_RE.test(content)) { WRONG_RE.lastIndex = 0; continue; }
  WRONG_RE.lastIndex = 0;
  const fixed = content.replace(WRONG_RE, CORRECT);
  if (fixed === content) continue;
  if (!dryRun) writeFileSync(file, fixed, 'utf8');
  console.log(`[${dryRun ? 'DRY' : 'FIX'}] ${basename(file)}`);
  fixedFiles++;
}
console.log(`\n완료: ${fixedFiles}개 파일 카카오 URL 수정${dryRun ? ' (dry)' : ''}`);
