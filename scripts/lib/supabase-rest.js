// 얇은 Supabase PostgREST 클라이언트. 의존성 추가 없이 fetch만 사용.

import { requireEnv } from './env.js';

function endpoint() {
  return requireEnv('SUPABASE_URL');
}
function key() {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

export async function supabaseUpsert(table, rows, { onConflict } = {}) {
  if (!Array.isArray(rows)) rows = [rows];
  if (rows.length === 0) return { count: 0 };

  const params = new URLSearchParams();
  if (onConflict) params.set('on_conflict', onConflict);
  const qs = params.toString();
  const url = `${endpoint()}/rest/v1/${table}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${table} upsert 실패: ${res.status} ${txt}`);
  }
  return { count: rows.length };
}

export async function supabaseSelect(table, { columns = '*', filter = '', limit } = {}) {
  const PAGE = 1000;
  const MAX_PAGES = 1000; // 런어웨이 루프 방지 (1000페이지 × 1000행 = 최대 100만 행)
  const baseUrl = `${endpoint()}/rest/v1/${table}?${new URLSearchParams({ select: columns })}${filter ? `&${filter}` : ''}`;

  const all = [];
  let start = 0;
  let pageCount = 0;

  while (true) {
    // 페이지 요청 수 초과 확인
    if (pageCount >= MAX_PAGES) {
      throw new Error(`${table} select 실패: 페이지 수 상한선 초과 (MAX_PAGES=${MAX_PAGES})`);
    }

    // If limit is set, only request what we still need; otherwise request a full page
    const remaining = limit != null ? limit - all.length : PAGE;
    if (remaining <= 0) break;
    const end = start + Math.min(remaining, PAGE) - 1;

    const res = await fetch(baseUrl, {
      headers: {
        apikey: key(),
        Authorization: `Bearer ${key()}`,
        Range: `${start}-${end}`,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`${table} select 실패: ${res.status} ${txt}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);

    // Stop if we've satisfied the limit, or if the server returned a partial page (last page)
    if (limit != null && all.length >= limit) break;
    if (rows.length < PAGE) break;

    start += rows.length;
    pageCount++;
  }

  return all;
}
