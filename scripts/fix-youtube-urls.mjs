/**
 * 오래된 원고 HTML에서 YouTube raw URL을 SE3 iframe으로 변환한다.
 *
 * 변환 패턴:
 *   https://www.youtube.com/watch?v=VIDEO_ID  →  <p align="center"><iframe ...></iframe></p>
 *   https://youtu.be/VIDEO_ID               →  위와 동일
 *
 * 사용법:
 *   node scripts/fix-youtube-urls.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const dryRun = process.argv.includes('--dry');
const IFRAME_TPL = (id) =>
  `<p align="center"><iframe width="544" height="306" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></p>`;

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

function fixContent(content) {
  let fixed = content;
  let count = 0;

  // 독립 줄의 youtube.com/watch URL
  fixed = fixed.replace(
    /^[ \t]*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)[^\n]*$/gm,
    (_, id) => { count++; return IFRAME_TPL(id); }
  );

  // 독립 줄의 youtu.be URL
  fixed = fixed.replace(
    /^[ \t]*https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)[^\n]*$/gm,
    (_, id) => { count++; return IFRAME_TPL(id); }
  );

  return { fixed, count };
}

const files = collectHtmlFiles('output');
let fixedFiles = 0;
let totalUrls = 0;
const errors = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (e) {
    errors.push(`읽기 실패: ${file}`);
    continue;
  }

  // YouTube raw URL 포함 여부 빠른 체크
  if (!content.includes('youtube.com/watch') && !content.includes('youtu.be/')) continue;

  const { fixed, count } = fixContent(content);
  if (count === 0) continue;

  if (!dryRun) {
    writeFileSync(file, fixed, 'utf8');
  }
  console.log(`[${dryRun ? 'DRY' : 'FIX'}] ${count}개 변환 → ${basename(file)}`);
  fixedFiles++;
  totalUrls += count;
}

console.log(`\n완료: ${fixedFiles}개 파일, ${totalUrls}개 URL 변환${dryRun ? ' (dry)' : ''}`);
if (errors.length) console.error('오류:', errors.join('\n'));
