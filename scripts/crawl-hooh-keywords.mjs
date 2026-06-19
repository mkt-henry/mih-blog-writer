// scripts/crawl-hooh-keywords.mjs
// 호오컨설팅(hooh.kr) 강사 목록 크롤러 → keywords 테이블 신규 추가 (전원 강연자/mih_speaker)
//
// 사용법:
//   node scripts/crawl-hooh-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-hooh-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';
import { supabaseSelect, supabaseUpsert } from './lib/supabase-rest.js';
import { loadEnv } from './lib/env.js';
import { norm, isDuplicate, collectOutputNames } from './crawl-artsro-keywords.mjs';

loadEnv();

const LIST_RE =
  /next\.asp\?m_idx=(\d+)"[\s\S]*?class="lname[^"]*">[\s\S]*?<p>([^<]+)<\/p>\s*<span>([^<]*)<\/span>[\s\S]*?<p class="cate">([^<]*)<\/p>/g;

export function parseListPage(html) {
  const out = [];
  for (const m of (html || '').matchAll(LIST_RE)) {
    out.push({ idx: m[1], name: m[2].trim(), title: m[3].trim(), cate: m[4].trim() });
  }
  return out;
}

export function buildRow({ idx, name, title, cate }) {
  const notes = [title, cate].map((s) => (s || '').trim()).filter(Boolean).join(' | ');
  return {
    id: `hooh-${idx}`,
    keyword: name,
    category: '강연자',
    agency: 'mih_speaker',
    notes,
    source: `https://www.hooh.kr/sub/teacher/next.asp?m_idx=${idx}`,
    is_active: true,
  };
}
