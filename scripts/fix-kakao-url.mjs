#!/usr/bin/env node
// 발행 대기 원고의 html_content 중 카카오 오픈채팅 URL이 다른 것을 통일

import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const TARGET_URL = 'https://open.kakao.com/o/snG6VXti';
const KAKAO_RE = /https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9]+/g;

async function supabaseUpdate(id, html_content) {
  const url = `${requireEnv('SUPABASE_URL')}/rest/v1/articles?id=eq.${id}`;
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ html_content }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`update 실패: ${res.status} ${txt}`);
  }
}

const articles = await supabaseSelect('articles', {
  columns: 'id,person_name,agency,html_content',
  filter: 'published_at=is.null',
});

console.log(`발행 대기 원고: ${articles.length}개\n`);

let updated = 0;
for (const a of articles) {
  const kakaoUrls = [...new Set(a.html_content.match(KAKAO_RE) ?? [])];
  const wrong = kakaoUrls.filter((u) => u !== TARGET_URL);
  if (wrong.length === 0) continue;

  console.log(`[${a.agency}] ${a.person_name}`);
  console.log(`  변경: ${wrong.join(', ')} → ${TARGET_URL}`);

  const fixed = a.html_content.replace(KAKAO_RE, TARGET_URL);
  try {
    await supabaseUpdate(a.id, fixed);
    console.log(`  ✓ 완료`);
    updated++;
  } catch (e) {
    console.error(`  ✗ 실패: ${e.message}`);
  }
}

console.log(`\n완료: ${updated}개 업데이트`);
