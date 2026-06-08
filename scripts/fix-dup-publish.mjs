/**
 * DB-side 중복발행 정리: 같은 published_url에 2행이 붙은 버그를 정리.
 * 실제 블로그 글 제목과 일치하는 행만 발행 유지, 나머지는 published_* = null 로 되돌림(pool 복귀).
 *
 *   node scripts/fix-dup-publish.mjs        ← dry-run (변경 없음)
 *   node scripts/fix-dup-publish.mjs --apply
 */
import { readFileSync } from 'fs';
function loadEnv(){try{const r=readFileSync('.env.local','utf8');for(const l of r.split('\n')){const m=l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);if(m&&!process.env[m[1].trim()])process.env[m[1].trim()]=m[2].trim();}}catch{}}
loadEnv();
const URL_=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
const apply=process.argv.includes('--apply');

// 검증으로 확정한 "미발행 전환(pool 복귀)" 대상과, 기대 published_url 가드
const UNPUBLISH=[
  {id:'f407e1c4-a46e-43e4-9c0c-5d5f94b61695', person:'박준',   logNo:'224280290240'},
  {id:'2cdfa5be-0c0f-4bd1-bc5b-05fee298cf2d', person:'잔나비', logNo:'224293584905'},
  {id:'2b5105cf-aa65-44c6-ad52-633c79f151c0', person:'강진',   logNo:'224290682705'},
  {id:'674ad0dd-fae9-4bb1-9f09-240f7c6fcd1e', person:'안성훈', logNo:'224290683836'},
  {id:'76423f7a-62b8-44ef-95db-14e88fa6e58e', person:'투어스', logNo:'224301274228'},
];

async function getRow(id){
  const res=await fetch(`${URL_}/rest/v1/articles?id=eq.${id}&select=id,person_name,title,published_at,published_url`,{headers});
  return (await res.json())[0];
}

let ok=0;
for(const t of UNPUBLISH){
  const row=await getRow(t.id);
  if(!row){console.log(`✗ ${t.person} ${t.id.slice(0,8)}: 행 없음`);continue;}
  const urlOk=(row.published_url||'').includes(t.logNo);
  const pubOk=row.published_at!==null;
  console.log(`[${t.person}] ${t.id.slice(0,8)} pub=${pubOk} urlMatch=${urlOk}`);
  console.log(`   title="${row.title}"`);
  if(!pubOk){console.log('   → 이미 미발행. skip');continue;}
  if(!urlOk){console.log(`   → 가드 실패: published_url(${row.published_url}) 에 ${t.logNo} 없음. SKIP(안전)`);continue;}
  if(!apply){console.log('   → (dry-run) published_* = null 로 되돌릴 예정');ok++;continue;}
  const res=await fetch(`${URL_}/rest/v1/articles?id=eq.${t.id}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({published_at:null,published_url:null,published_source:null})});
  if(res.ok){console.log('   ✓ 미발행 전환 완료');ok++;}
  else console.log(`   ✗ 실패 ${res.status} ${await res.text()}`);
}
console.log(`\n${apply?'적용':'dry-run'} 대상 ${ok}/${UNPUBLISH.length}`);
