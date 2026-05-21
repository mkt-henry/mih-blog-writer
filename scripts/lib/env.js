import { readFileSync } from 'fs';

export function loadEnv(file = '.env.local') {
  try {
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim();
      }
    }
  } catch {
    /* 파일 없으면 환경변수만 사용 */
  }
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`환경변수 ${name} 가 필요합니다. (.env.local 또는 셸 환경에 설정하세요)`);
    process.exit(1);
  }
  return v;
}
