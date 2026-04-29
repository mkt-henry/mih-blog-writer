const fs = require('fs');
const p = process.argv[2];
let h = fs.readFileSync(p, 'utf8');
let t = h.replace(/<!--[\s\S]*?-->/g, '');
t = t.replace(/<(script|style)[\s\S]*?<\/(script|style)>/gi, '');
t = t.replace(/<[^>]+>/g, ' ');
t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
t = t.replace(/\s+/g, ' ').trim();

const charCount = [...t].length;
const charCountNoSpace = [...t.replace(/\s/g, '')].length;

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cnt(str, kw) {
  return (str.match(new RegExp(esc(kw), 'g')) || []).length;
}

const kws = ['윤윤구 섭외', '윤윤구', 'EBS', '학생부', '입시', '강연', '설명회', '학부모', '수시', '정시'];
console.log('===== 원고 분석 리포트 =====');
console.log('본문 글자수 (공백 포함):', charCount, '자');
console.log('본문 글자수 (공백 제외):', charCountNoSpace, '자');
console.log('');
console.log('----- 키워드 등장 횟수 -----');
kws.forEach(k => console.log(k.padEnd(14, ' '), cnt(t, k), '회'));
