export type KeywordColumnKey =
  | "keyword"
  | "search"
  | "category"
  | "agency"
  | "published_url"
  | "instagram"
  | "notes";

export type KeywordColumnMeta = {
  key: KeywordColumnKey;
  label: string;
  always?: boolean; // 끌 수 없음(항상 노출)
  default: boolean; // 기본 노출 여부
  selectField?: string; // 키워드 전용 사용자 쿼리 시 select 할 DB 컬럼(없으면 keyword 파생)
};

// 컬럼 단일 출처. 원고(article)는 키워드 전용 사용자에게 영구 비노출이므로 여기 없음.
export const KEYWORD_COLUMNS: KeywordColumnMeta[] = [
  { key: "keyword", label: "키워드", always: true, default: true, selectField: "keyword" },
  { key: "search", label: "검색", default: true },
  { key: "category", label: "분류", default: true, selectField: "category" },
  { key: "agency", label: "계정", default: false, selectField: "agency" },
  { key: "published_url", label: "발행 URL", default: false, selectField: "published_url" },
  { key: "instagram", label: "인스타그램", default: false, selectField: "instagram" },
  { key: "notes", label: "메모", default: false, selectField: "notes" },
];

export const DEFAULT_KEYWORD_COLUMNS: KeywordColumnKey[] = KEYWORD_COLUMNS.filter(
  (c) => c.default,
).map((c) => c.key);

const VALID_KEYS = new Set(KEYWORD_COLUMNS.map((c) => c.key));

// 유효 키만 + keyword 강제 포함 + 메타 순서로 정렬. 무효/원고 키는 제거.
export function normalizeColumns(keys: string[]): KeywordColumnKey[] {
  const picked = new Set<KeywordColumnKey>();
  for (const k of keys) {
    if (VALID_KEYS.has(k as KeywordColumnKey)) picked.add(k as KeywordColumnKey);
  }
  picked.add("keyword");
  return KEYWORD_COLUMNS.filter((c) => picked.has(c.key)).map((c) => c.key);
}
