// HTML 파일 경로 파싱:
//   output/{YYYY-MM-DD}/{agency_slug}/{사람명}_{제목}.html
// → { publishDate, agency, slug, personName, title, sourcePath, fileName }
//
// scripts/build-manifest.js의 parseFileName 로직을 추출·재사용.

import { sep, normalize } from 'path';

export const AGENCIES = new Set(['mih_speaker', 'mih_casting', 'mih_agency', 'kyh620303']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFileName(filename) {
  if (!filename.endsWith('.html')) return null;
  const withoutExt = filename.slice(0, -5);
  const idx = withoutExt.indexOf('_');
  if (idx === -1) return null;
  return { slug: withoutExt.slice(0, idx), title: withoutExt.slice(idx + 1) };
}

// path는 절대/상대 둘 다 허용. "output/" 이후 부분만 사용.
export function parseArticlePath(path) {
  const normalized = normalize(path).replaceAll(sep, '/');
  const idx = normalized.lastIndexOf('output/');
  const sub = idx >= 0 ? normalized.slice(idx + 'output/'.length) : normalized;

  const parts = sub.split('/');
  if (parts.length < 3) return null;

  const [date, agency, ...rest] = parts;
  const fileName = rest.join('/');
  if (!DATE_RE.test(date)) return null;
  if (!AGENCIES.has(agency)) return null;

  const parsed = parseFileName(fileName);
  if (!parsed) return null;

  return {
    publishDate: date,
    agency,
    slug: parsed.slug,
    personName: parsed.slug, // 파일명 컨벤션상 두 값이 동일
    title: parsed.title,
    sourcePath: `${date}/${agency}/${fileName}`,
    fileName,
  };
}
