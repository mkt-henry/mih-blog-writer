#!/usr/bin/env node
// UserPromptSubmit 훅: 프롬프트에 "원고"/"섭외"가 있으면 워크플로우 리마인더를
// stdout으로 출력한다 (UserPromptSubmit stdout은 컨텍스트에 주입됨).
// 매칭 안 되면 아무것도 출력하지 않는다.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let prompt = '';
  try { prompt = JSON.parse(raw).prompt ?? ''; } catch { prompt = raw; }

  if (/원고|섭외/.test(prompt)) {
    process.stdout.write(
      '[원고 작성 워크플로우] naver-article 스킬을 사용하세요. ' +
      'docs/지침/00_개요.md로 인물/카테고리 분기를 판단하고, ' +
      '발행 전 반드시 `npm run check:article "<html>"`를 통과시키세요 ' +
      '(이미지 4·출처 4·유튜브 iframe 2·se-text-paragraph·table-layout:fixed 필수).'
    );
  }
  process.exit(0);
});
