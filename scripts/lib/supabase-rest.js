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
  const params = new URLSearchParams();
  params.set('select', columns);
  if (limit) params.set('limit', String(limit));
  const url = `${endpoint()}/rest/v1/${table}?${params}${filter ? `&${filter}` : ''}`;
  const res = await fetch(url, {
    headers: { apikey: key(), Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${table} select 실패: ${res.status} ${txt}`);
  }
  return res.json();
}
