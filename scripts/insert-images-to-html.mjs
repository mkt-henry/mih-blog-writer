#!/usr/bin/env node
// SE-src{N} 태그 앞에 이미지를 삽입한다.
// 사용법: node scripts/insert-images-to-html.mjs <html-path> <alt-name> <img1-url> <img2-url> ...

import { readFileSync, writeFileSync } from 'fs';

const [, , htmlPath, altName, ...imgUrls] = process.argv;
if (!htmlPath || !altName || imgUrls.length === 0) {
  console.error('사용법: node scripts/insert-images-to-html.mjs <html-path> <alt-name> <img1-url> ...');
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');

for (let i = 0; i < imgUrls.length; i++) {
  const srcId = `SE-src${i + 1}`;
  const imgTag = `<p align="center"><img src="${imgUrls[i]}" width="544" alt="${altName} 공식 SNS 이미지"></p>\n`;
  const target = `<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="${srcId}">`;
  if (!html.includes(target)) {
    console.log(`  ⚠ ${srcId} 없음, 건너뜀`);
    continue;
  }
  html = html.replace(target, imgTag + target);
  console.log(`  ✓ ${srcId} 앞에 img${i + 1} 삽입`);
}

writeFileSync(htmlPath, html, 'utf8');
console.log(`\n저장: ${htmlPath}`);
