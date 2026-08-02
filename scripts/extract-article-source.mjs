#!/usr/bin/env node
// 미발행 원고 재작성용 재료 추출기.
//   node scripts/extract-article-source.mjs --batch 1 [--size 5]
//   node scripts/extract-article-source.mjs --person "김연지"
//
// 기존 원고에서 "사실 정보 · 이미지 · 영상"만 뽑아낸다.
// 재작성은 이 재료만 가지고 하며, 새 웹 검색·이미지 수집은 하지 않는다.

import { readFileSync } from 'fs';
import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const batch = Number(flag('batch', 1));
const size = Number(flag('size', 5));
const person = flag('person', null);

// 정렬에 id 를 더해 tie-break 를 고정한다. 같은 publish_date 가 많아
// 순서가 흔들리면 배치마다 같은 원고가 다시 뽑힌다.
const filter = person
  ? `person_name=eq.${encodeURIComponent(person)}&order=publish_date.asc,id.asc`
  : 'published_at=is.null&order=publish_date.asc,id.asc';

const rows = await supabaseSelect('articles', {
  columns: 'id,agency,person_name,slug,title,publish_date,source_path,html_content,instagram_url',
  filter,
});

// 재작성 완료분 제외 — publish 해도 published_at 은 네이버 발행 시각이라 계속 null 이다.
// 따라서 큐에서 빠지지 않으므로 완료 목록을 따로 들고 있어야 한다.
const DONE_FILE = new URL('../output/diag/rewrite-done.json', import.meta.url);
let done = [];
try {
  done = JSON.parse(readFileSync(DONE_FILE, 'utf8'));
} catch {
  /* 첫 실행 */
}
const doneSet = new Set(done);

const pending = rows.filter((a) => !doneSet.has(a.id));
const targets = person ? rows : pending.slice((batch - 1) * size, batch * size);

if (!person) {
  console.log(`# 남은 재작성 대상 ${pending.length}건 (완료 ${doneSet.size}건)\n`);
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|td|div|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

console.log(`# 재작성 재료 — 배치 ${batch} (${targets.length}건)\n`);

for (const a of targets) {
  const html = a.html_content || '';
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/agency-card|business-card|kakao/i.test(u));
  const yt = [...html.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  const tags = (html.replace(/<[^>]+>/g, ' ').match(/#[^\s#<]+/g) || []);
  const body = stripTags(html);
  // 해시태그 단락은 재료에서 제외 (재작성 시 새로 구성)
  const bodyNoTags = body.split('\n').filter((l) => !/^#/.test(l)).join('\n');

  console.log('='.repeat(70));
  console.log(`## ${a.person_name}  [${a.agency} / ${a.publish_date}]`);
  console.log(`- 기존 제목: ${a.title}`);
  console.log(`- 저장 경로: output/${a.source_path}`);
  console.log(`- 인스타: ${a.instagram_url || '(없음)'}`);
  console.log(`- 이미지 ${imgs.length}개:`);
  imgs.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  console.log(`- 유튜브 ${yt.length}개: ${yt.join(', ')}`);
  console.log(`- 해시태그 ${tags.length}개`);
  console.log(`\n--- 기존 본문 (사실 정보 추출용) ---`);
  console.log(bodyNoTags);
  console.log();
}
