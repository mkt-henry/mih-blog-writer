// 지식 그래프 접근 창구. 에이전트는 DB 에 직접 붙지 않고 이 하나만 쓴다.
//
//   node scripts/kb.mjs brief --person="아이유"
//   node scripts/kb.mjs audit --person="아이유" --html="output/.../아이유_....html"
//   node scripts/kb.mjs put < payload.json
//   node scripts/kb.mjs status < updates.json
//   node scripts/kb.mjs stale [--person=이름]
//   node scripts/kb.mjs conflicts [--person=이름]
//   node scripts/kb.mjs run-put < step.json
//
// 출력은 언제나 JSON 한 덩어리다(에이전트가 파싱한다).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { normalizePayload } from './lib/kb.mjs';
import { fetchAll } from '../lib/name-match.mjs';

// dotenv 를 쓰지 않고 직접 읽는 이유: 그 패키지가 stdout 에 배너를 찍어 JSON 출력을 깨뜨린다.
// 이 CLI 의 stdout 은 에이전트가 그대로 파싱하는 값이라 한 글자도 섞이면 안 된다.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const today = () => new Date().toISOString().slice(0, 10);

// 출력은 언제나 한 덩어리다. 호출부는 반드시 `return out(...)` 로 그 자리에서 끝낸다 —
// 출력 후 아래 코드가 계속 돌아 JSON 이 두 번 찍히면 에이전트의 파싱이 깨진다.
//
// process.exit 를 쓰지 않는 이유: 열린 소켓이 있는 상태에서 강제 종료하면 Windows 에서
// libuv 어서션이 터지고 종료 코드가 127 로 나간다. 에이전트가 그걸 실패로 읽는다.
const out = (o) => { console.log(JSON.stringify(o, null, 2)); };
const fail = (msg) => { console.error(msg); process.exitCode = 1; throw new Error(msg); };

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 인물 이름 → keywords 행. 그래프의 인물 노드는 여기에 매달린다. */
async function findKeyword(name) {
  const { data, error } = await db.from('keywords').select('id, keyword, category, is_active')
    .eq('keyword', name.trim()).limit(1);
  if (error) fail(`keywords 조회 실패: ${error.message}`);
  return data?.[0] ?? null;
}

async function personEntity(name) {
  const kw = await findKeyword(name);
  if (!kw) return { kw: null, entity: null };
  const { data } = await db.from('mih_kb_entities').select('*')
    .eq('kind', 'person').eq('keyword_id', kw.id).limit(1);
  if (data?.[0]) return { kw, entity: data[0] };
  // 키워드가 개인이 아닌 경우(공연팀·앙상블 등)도 체인이 돌아야 한다
  const { data: any } = await db.from('mih_kb_entities').select('*')
    .eq('keyword_id', kw.id).limit(1);
  return { kw, entity: any?.[0] ?? null };
}

async function main() {
 if (cmd === 'brief') {
  const name = arg('person') ?? fail('--person=이름 이 필요하다');
  const { kw, entity } = await personEntity(name);
  if (!kw) return out({ person: name, found: false, note: 'keywords 에 없는 인물' });
  if (!entity) {
    return out({
      person: name, found: true, keyword_id: kw.id, category: kw.category,
      entity_id: null, counts: { verified: 0, draft: 0, conflict: 0 },
      verified: [], edges: [], signals: [],
      note: '아직 수집된 지식이 없다',
    });
  }
  const { data: claims } = await db.from('mih_kb_claims')
    .select('id, claim, status, kind, quote, note, confidence, expires_on, mih_kb_sources(url, tier)')
    .eq('entity_id', entity.id);
  const { data: signals } = await db.from('mih_kb_signals')
    .select('metric, value, unit, observed_at').eq('entity_id', entity.id)
    .order('observed_at', { ascending: false });
  const { data: edges } = await db.from('mih_kb_edges')
    .select('rel, note, mih_kb_entities!mih_kb_edges_dst_fkey(kind, name)').eq('src', entity.id);
  const verified = (claims ?? []).filter((c) => c.status === 'verified');
  return out({
    person: name, found: true, keyword_id: kw.id, category: kw.category, entity_id: entity.id,
    counts: {
      verified: verified.length,
      draft: (claims ?? []).filter((c) => c.status === 'draft').length,
      conflict: (claims ?? []).filter((c) => c.status === 'conflict').length,
    },
    verified: verified.map((c) => ({
      claim: c.claim, kind: c.kind, note: c.note, confidence: c.confidence,
      source: c.mih_kb_sources?.url, tier: c.mih_kb_sources?.tier,
    })),
    edges: (edges ?? []).map((e) => ({
      rel: e.rel, target: e.mih_kb_entities?.name, kind: e.mih_kb_entities?.kind, note: e.note,
    })),
    signals: signals ?? [],
  });
} else if (cmd === 'audit') {
  // 원고 HTML 의 사실 진술이 verified 근거로 뒷받침되는지 기계적으로 대조한다.
  //
  // 왜 만들었나 (2026-08-22): 체인 첫 주 98편 중 검수를 1회에 통과한 것은 3편뿐이었고,
  // `kb:미근거` 가 지적 1위(94건)였다. 매번 검수 에이전트가 원고 전문을 다시 읽어야
  // 잡히던 것이라 작성→검수 라운드를 한 번씩 더 태우고 있었다.
  //
  // 전부는 못 잡는다 — 연도처럼 확실히 대조되는 것만 본다. 발행 91편 실측에서
  // 연도 256건 중 근거 없는 것이 3건(1%)이라 오탐이 거의 없다.
  // 나머지 사실 주장의 근거 대조는 여전히 검수 에이전트의 몫이다.
  const name = arg('person') ?? fail('--person=이름 이 필요하다');
  const file = arg('html') ?? fail('--html=경로 가 필요하다');
  const html = readFileSync(file, 'utf8');
  const prose = html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/#[^\s#<]+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');

  const { kw, entity } = await personEntity(name);
  if (!kw || !entity) return out({ person: name, found: false, note: 'KB 근거가 없다 — 대조 불가' });

  // 근거 뭉치: 이 인물의 verified 사실 + 원고에 이름이 등장하는 다른 엔티티의 verified 사실
  //           (소속 그룹·앨범·프로그램 엔티티에 붙은 연도가 인물 원고에 정당하게 들어간다)
  // PostgREST 는 한 번에 1,000행만 돌려준다. 엔티티가 그보다 많아지면 인물 본인 엔티티가
  // 잘려 나가 자기 verified 근거로 자기 연도를 못 찾는 오탐이 난다 (2026-08-24, DJ IAMMOOD).
  const ents = await fetchAll(db, 'mih_kb_entities', 'id, name');
  const related = ents.filter((e) => e.id === entity.id || prose.includes(e.name));
  const { data: claims } = await db.from('mih_kb_claims')
    .select('claim, quote, status, entity_id')
    .in('entity_id', related.map((e) => e.id));
  const evidence = (claims ?? [])
    .filter((c) => c.status === 'verified')
    .map((c) => `${c.claim} ${c.quote ?? ''}`)
    .join(' ');

  const years = [...new Set(prose.match(/(?:19|20)\d{2}/g) ?? [])];
  const unbacked = years.filter((y) => !evidence.includes(y));
  return out({
    person: name, html: file,
    verified: (claims ?? []).filter((c) => c.status === 'verified').length,
    years: years.length,
    unbacked_years: unbacked,
    ok: unbacked.length === 0,
    note: unbacked.length
      ? `verified 근거에 없는 연도 ${unbacked.length}건 — 근거를 찾아 붙이거나 본문에서 빼라`
      : '연도 대조 통과 (다른 사실 주장은 검수 에이전트가 본다)',
  });
} else if (cmd === 'put') {
  const payload = await readStdin();
  const norm = normalizePayload(payload, today());

  const srcId = new Map();
  for (const s of norm.sources) {
    const { data, error } = await db.from('mih_kb_sources')
      .upsert({
        url: s.url, title: s.title ?? null, publisher: s.publisher ?? null,
        tier: s.tier, snapshot: s.snapshot, fetched_at: new Date().toISOString(),
      }, { onConflict: 'url' })
      .select('id').single();
    if (error) fail(`출처 적재 실패: ${error.message}`);
    srcId.set(s.ref, data.id);
  }

  const entId = new Map();
  for (const e of norm.entities) {
    const { data, error } = await db.from('mih_kb_entities')
      .upsert({
        keyword_id: e.keyword_id ?? null, kind: e.kind, name: e.name,
        aliases: e.aliases ?? null, summary: e.summary ?? null, attrs: e.attrs ?? {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'kind,name' })
      .select('id').single();
    if (error) fail(`엔티티 적재 실패: ${error.message}`);
    entId.set(e.ref, data.id);
  }

  // 앞 단계에서 거부된 엔티티를 가리키는 참조는 여기서 걸러낸다. 그대로 넘기면
  // 'p' 같은 payload 내부 ref 가 uuid 자리에 들어가 DB 에러로 전체가 죽는다.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resolveEnt = (ref, what) => {
    const id = entId.get(ref);
    if (id) return id;
    if (UUID.test(String(ref ?? ''))) return ref;
    norm.rejected.push(`${what}: 엔티티 '${ref}' 를 찾을 수 없다(적재되지 않았거나 거부됨)`);
    return null;
  };

  let edgesIn = 0;
  for (const g of norm.edges) {
    const src = resolveEnt(g.src, `관계 ${g.src}->${g.dst}`);
    const dst = resolveEnt(g.dst, `관계 ${g.src}->${g.dst}`);
    if (!src || !dst) continue;
    const { error } = await db.from('mih_kb_edges')
      .upsert({ src, dst, rel: g.rel, attrs: g.attrs ?? {}, note: g.note ?? null },
        { onConflict: 'src,dst,rel' });
    if (error) fail(`관계 적재 실패: ${error.message}`);
    edgesIn += 1;
  }

  // 사실은 엔티티에만 붙인다. 관계에 붙는 사실은 이번 범위 밖이다(컬럼은 두되 쓰지 않는다) —
  // 관계를 가리키는 참조 표기를 에이전트에게 요구할 만한 값이 아직 없다.
  let claimsIn = 0;
  for (const c of norm.claims) {
    const entityId = resolveEnt(c.entity, `사실 "${c.claim}"`);
    if (!entityId) continue;
    const { error } = await db.from('mih_kb_claims').upsert({
      entity_id: entityId,
      claim: c.claim, kind: c.kind, source_id: srcId.get(c.source) ?? null,
      quote: c.quote, status: 'draft', expires_on: c.expires_on,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'entity_id,claim' });
    if (error) fail(`사실 적재 실패: ${error.message}`);
    claimsIn += 1;
  }

  let signalsIn = 0;
  for (const g of norm.signals) {
    const entityId = resolveEnt(g.entity, `신호 ${g.metric}`);
    if (!entityId) continue;
    const { error } = await db.from('mih_kb_signals').insert({
      entity_id: entityId, metric: g.metric,
      value: g.value, unit: g.unit ?? null, source_id: srcId.get(g.source) ?? null,
    });
    if (error) fail(`신호 적재 실패: ${error.message}`);
    signalsIn += 1;
  }

  return out({
    ok: true, sources: norm.sources.length, entities: norm.entities.length,
    edges: edgesIn, claims: claimsIn, signals: signalsIn, rejected: norm.rejected,
  });
} else if (cmd === 'status') {
  const { updates } = await readStdin();
  const done = [];
  for (const u of updates ?? []) {
    const patch = { status: u.status, updated_at: new Date().toISOString() };
    if (u.status === 'verified') {
      patch.verified_at = new Date().toISOString();
      patch.confidence = u.confidence ?? null;
    }
    if (u.quote) patch.quote = u.quote;
    if (u.note) patch.note = u.note;
    if (u.expires_on) patch.expires_on = u.expires_on;
    const { data: hit, error } = await db.from('mih_kb_claims')
      .update(patch).eq('id', u.id).select('id');
    if (error) fail(`상태 전이 실패 (${u.id}): ${error.message}`);
    if (!hit?.length) fail(`상태 전이 실패 (${u.id}): 해당 claim 이 없다`);
    done.push({ id: u.id, status: u.status });
  }
  const counts = {};
  for (const d of done) counts[d.status] = (counts[d.status] ?? 0) + 1;
  return out({ ok: true, updated: done.length, counts });
} else if (cmd === 'stale') {
  const name = arg('person');
  let q = db.from('mih_kb_claims')
    .select('id, claim, status, quote, expires_on, note, mih_kb_sources(url, tier), mih_kb_entities(name, kind)');
  if (name) {
    const { entity } = await personEntity(name);
    if (!entity) return out({ person: name, count: 0, rows: [] });
    q = q.eq('entity_id', entity.id);
  }
  const { data, error } = await q.in('status', ['draft', 'stale']);
  if (error) fail(`stale 조회 실패: ${error.message}`);
  const t = today();
  const rows = (data ?? []).map((c) => ({
    id: c.id, claim: c.claim, quote: c.quote, note: c.note,
    entity: c.mih_kb_entities?.name, source: c.mih_kb_sources?.url, tier: c.mih_kb_sources?.tier,
    reason: c.status === 'stale' ? 'stale' : c.expires_on && c.expires_on < t ? 'expired' : 'draft',
  }));
  return out({ person: name ?? null, count: rows.length, rows });
} else if (cmd === 'conflicts') {
  const name = arg('person');
  let q = db.from('mih_kb_claims').select('id, claim, note, mih_kb_entities(name)').eq('status', 'conflict');
  if (name) {
    const { entity } = await personEntity(name);
    if (!entity) return out({ person: name, count: 0, rows: [] });
    q = q.eq('entity_id', entity.id);
  }
  const { data, error } = await q;
  if (error) fail(`conflicts 조회 실패: ${error.message}`);
  return out({ count: data?.length ?? 0, rows: data ?? [] });
} else if (cmd === 'run-put') {
  // 단계 시작: { run?, person, agency, step, agent, attempt?, slug? } → { run, step }
  // 단계 종료: { step: "<step id>", status: "done"|"failed", metrics?, note?, last? }
  const p = await readStdin();
  if (p.status) {
    const { error } = await db.from('mih_run_steps')
      .update({
        status: p.status, metrics: p.metrics ?? {}, note: p.note ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq('id', p.step);
    if (error) fail(`단계 종료 실패: ${error.message}`);
    // 실패로 닫히거나 마지막 단계면 run 자체도 닫는다. 열어 둔 채 끝내면
    // 그 run 은 영영 "응답 없음"으로 남아 죽은 세션과 구분되지 않는다.
    if (p.status === 'failed' || p.last) {
      const { data } = await db.from('mih_run_steps').select('run_id').eq('id', p.step).single();
      if (data) await db.from('mih_runs').update({ ended_at: new Date().toISOString() }).eq('id', data.run_id);
    }
    return out({ ok: true, step: p.step, status: p.status });
  } else {
    let runId = p.run;
    if (!runId) {
      const kw = p.person ? await findKeyword(p.person) : null;
      const { data, error } = await db.from('mih_runs')
        .insert({ keyword_id: kw?.id ?? null, person: p.person ?? null, agency: p.agency ?? null })
        .select('id').single();
      if (error) fail(`run 시작 실패: ${error.message}`);
      runId = data.id;
    }
    const { data, error } = await db.from('mih_run_steps')
      .insert({ run_id: runId, step: p.step, agent: p.agent ?? null, attempt: p.attempt ?? 1, slug: p.slug ?? null })
      .select('id').single();
    if (error) fail(`단계 시작 실패: ${error.message}`);
    return out({ ok: true, run: runId, step: data.id });
  }
} else {
  fail('명령: brief | audit | put | status | stale | conflicts | run-put');
 }
}

try {
  await main();
} catch (e) {
  if (process.exitCode !== 1) { console.error(e.message); process.exitCode = 1; }
}
