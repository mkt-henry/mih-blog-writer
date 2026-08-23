// 로컬 임베딩. 과금 없음, 모델은 `.models/` 에 캐시된다(gitignore).
//
// 순위 재현 평가(`scripts/rank-eval.mjs`)에서만 쓴다. 원고 품질 게이트로는 쓰지 않는다 —
// 그 용도는 2026-08-15 에 재현율 43.3% 로 닫혔고, 다시 열려면 이 자를 통과해야 한다.
//
// ⚠ **풀링을 모델에 맞춰야 한다.** BGE 계열은 CLS 풀링이 정답이다. mean 을 쓰면
// 코사인이 0.7~0.95 좁은 구간에 뭉쳐 "모든 문서가 서로 비슷하다"는 착시가 생긴다
// (2026-08-15 기록의 "우리 원고끼리 0.85~0.94, 무관한 문서도 0.70" 이 그 증상이다).
// 같은 모델을 CLS 로 돌리면 무관한 한국어 문서쌍이 0.30 근처로 떨어진다.

import { pipeline, env } from '@huggingface/transformers';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

env.cacheDir = './.models';

// 모델별 기본 풀링. 새 모델을 넣을 때 여기부터 확인한다.
const POOLING = {
  'Xenova/bge-m3': 'cls',
  'Xenova/multilingual-e5-large': 'mean',   // E5 계열은 mean + query:/passage: 프리픽스
  'Xenova/multilingual-e5-small': 'mean',
};
// E5 계열만 비대칭 프리픽스가 필수다. 안 붙이면 성능이 눈에 띄게 떨어진다.
const PREFIX = {
  'Xenova/multilingual-e5-large': { query: 'query: ', doc: 'passage: ' },
  'Xenova/multilingual-e5-small': { query: 'query: ', doc: 'passage: ' },
};

let _pipe = null, _name = null;
export async function loadEmbedder(model, { dtype = 'q8' } = {}) {
  if (_pipe && _name === model) return _pipe;
  _pipe = await pipeline('feature-extraction', model, { dtype });
  _name = model;
  return _pipe;
}

export const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * 텍스트 여러 개 → 정규화된 벡터 배열.
 * kind: 'query' | 'doc' (프리픽스가 필요한 모델에서만 쓰인다)
 */
export async function embed(model, texts, { kind = 'doc', batch = 8 } = {}) {
  const ex = await loadEmbedder(model);
  const pooling = POOLING[model] ?? 'mean';
  const pre = PREFIX[model]?.[kind] ?? '';
  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch).map((t) => pre + t);
    const r = await ex(slice, { pooling, normalize: true });
    out.push(...r.tolist());
  }
  return out;
}

// 문서를 조각으로 자른다. 네이버가 문서 전체가 아니라 문단을 보고 맞출 수 있으므로
// "조각 최고 유사도"를 문서 점수의 후보로 같이 잰다.
export function chunk(text, size = 500, overlap = 100) {
  const out = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out.length ? out : [text];
}

// ── 디스크 캐시 ────────────────────────────────────────────────────────────
// 문서 천 건 임베딩은 두 시간이다. 모델을 바꿔 가며 여러 번 돌려야 하므로 반드시 캐시한다.
//
// **JSON 으로 저장하지 않는다.** 처음엔 그렇게 했다가 막혔다 — 1,158건이 208MB 가 되고
// (float 하나가 숫자 텍스트로 17바이트), 다시 읽을 때 JSON.parse 가 10분 넘게 걸려
// 캐시가 있으나 마나였다. Float32 이진으로 쓰면 같은 데이터가 48MB 이고 즉시 읽힌다.
//
// 형식: `<path>.idx`(JSON: 키 → [offset, rows, dim]) + `<path>.bin`(Float32 연속).
const DIM_GUARD = 4096;

export function openCache(path) {
  const base = path.replace(/\.json$/, '');
  mkdirSync(base.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  const idxPath = `${base}.idx`, binPath = `${base}.bin`;

  const index = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : {};
  const blob = existsSync(binPath) ? readFileSync(binPath) : Buffer.alloc(0);
  const floats = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.length / 4));
  const pending = new Map();   // 이번 실행에서 새로 계산한 것

  // 값은 언제나 벡터 배열(행렬)로 다룬다. 벡터 1개는 행이 1인 행렬로 저장한다.
  const read = (k) => {
    if (pending.has(k)) return pending.get(k);
    const e = index[k];
    if (!e) return undefined;
    const [off, rows, dim] = e;
    const out = new Array(rows);
    for (let r = 0; r < rows; r++) out[r] = Array.from(floats.subarray(off + r * dim, off + (r + 1) * dim));
    return out;
  };

  return {
    // 벡터 1개를 넣고 뺄 때와 여러 개를 넣고 뺄 때를 구분한다.
    get: (k) => { const m = read(k); return m && m.length === 1 ? m[0] : m; },
    getMany: (k) => read(k),
    set: (k, v) => pending.set(k, Array.isArray(v[0]) ? v : [v]),
    has: (k) => pending.has(k) || k in index,
    size: () => Object.keys(index).length + pending.size,
    save() {
      const keys = [...new Set([...Object.keys(index), ...pending.keys()])];
      const newIndex = {};
      let total = 0;
      for (const k of keys) {
        const m = pending.get(k) ?? read(k);
        if (!m?.length || m[0].length > DIM_GUARD) continue;
        newIndex[k] = [total, m.length, m[0].length];
        total += m.length * m[0].length;
      }
      const buf = new Float32Array(total);
      for (const k of Object.keys(newIndex)) {
        const [off, rows, dim] = newIndex[k];
        const m = pending.get(k) ?? read(k);
        for (let r = 0; r < rows; r++) buf.set(m[r], off + r * dim);
      }
      writeFileSync(binPath, Buffer.from(buf.buffer, 0, buf.byteLength));
      writeFileSync(idxPath, JSON.stringify(newIndex));
    },
  };
}

// ── 재순위(cross-encoder) ──────────────────────────────────────────────────
// 바이인코더 코사인은 쿼리와 문서를 따로 벡터로 만들어 비교한다. cross-encoder 는
// 둘을 **함께** 넣고 관련도를 직접 낸다 — 검색엔진의 재순위 단계가 하는 일이고,
// 보통 코사인보다 확실히 낫다.
//
// 실측(2026-08-22): 관련 섭외 글 +3.9, 주제만 같고 섭외 아님 −4.9, 무관 −10.2.
// 500자 조각 24개에 1.0초 — 코사인만큼 싸다.
let _rrTok = null, _rrModel = null, _rrName = null;
export async function loadReranker(model, { dtype = 'q8' } = {}) {
  if (_rrName === model) return;
  const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
  _rrTok = await AutoTokenizer.from_pretrained(model);
  _rrModel = await AutoModelForSequenceClassification.from_pretrained(model, { dtype });
  _rrName = model;
}

/** 쿼리 1개 대 문서 조각 여러 개 → 조각별 점수(로짓) 배열. 높을수록 관련. */
export async function rerank(model, query, passages, { batch = 12 } = {}) {
  await loadReranker(model);
  const out = [];
  for (let i = 0; i < passages.length; i += batch) {
    const slice = passages.slice(i, i + batch);
    const inputs = _rrTok(Array(slice.length).fill(query), {
      text_pair: slice, padding: true, truncation: true,
    });
    const { logits } = await _rrModel(inputs);
    out.push(...logits.tolist().map((x) => x[0]));
  }
  return out;
}
