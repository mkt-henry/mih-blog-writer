/**
 * 발행행의 published_url을 실제 fetch → 리다이렉트 후 최종 logNo + 실제 제목 확인.
 * 최종 logNo 기준으로 중복(서로 다른 저장 URL이 같은 글로 수렴) 탐지.
 * 사용: node scripts/diag-url-canonical.mjs <agency>   (기본 mih_casting)
 */
import { readFileSync } from 'fs';
function loadEnv(){try{const r=readFileSync('.env.local','utf8');for(const l of r.split('\n')){const m=l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);if(m&&!process.env[m[1].trim()])process.env[m[1].trim()]=m[2].trim();}}catch{}}
loadEnv();
const URL_=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:KEY,Authorization:`Bearer ${KEY}`};
const agency=process.argv[2]||'mih_casting';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function logNoFromUrl(u){const m=String(u).match(/logNo=(\d+)/)||String(u).match(/\/(\d{6,})(?:\?|$)/);return m?m[1]:null;}
function toMobile(u){const ln=logNoFromUrl(u);const id=(String(u).match(/blogId=([^&]+)/)||String(u).match(/blog\.naver\.com\/([^/]+)\//)||[])[1]||agency;return`https://m.blog.naver.com/PostView.naver?blogId=${id}&logNo=${ln}`;}

async function probe(u,max=5){let d=1500;for(let a=0;a<=max;a++){try{
  const res=await fetch(toMobile(u),{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'},redirect:'follow'});
  const t=await res.text();
  if(res.status===429){await sleep(d);d=Math.min(d*2,15000);continue;}
  const noPost=/errorType=noPost|삭제되었거나 존재하지 않는|존재하지 않는 게시물/.test(t);
  if(noPost)return{status:res.status,dead:true};
  // 본문에서 실제 logNo / 제목 추출
  const finalLog=(t.match(/"logNo"\s*:\s*"?(\d+)/)||t.match(/logNo=(\d+)/)||[])[1]||logNoFromUrl(u);
  const title=((t.match(/<meta property="og:title" content="([^"]*)"/)||t.match(/<title>([^<]*)<\/title>/)||[])[1]||'').replace(/&middot;/g,'·').trim();
  return{status:res.status,dead:false,finalLog,title};
}catch{await sleep(d);d=Math.min(d*2,15000);}}return{status:-1,dead:null};}

async function selAll(t,c,f){let r=[],o=0;const L=1000;while(1){const res=await fetch(`${URL_}/rest/v1/${t}?select=${c}&limit=${L}&offset=${o}${f||''}`,{headers});const b=await res.json();r.push(...b);if(b.length<L)break;o+=L;}return r;}

const pub=await selAll('articles','id,person_name,title,published_url',`&agency=eq.${agency}&published_at=not.is.null`);
console.log(`${agency} 발행행 ${pub.length}건 — published_url 실제 확인 중...\n`);

const byFinal=new Map();
let dead=0;
for(const a of pub){
  if(!a.published_url){console.log(`  (url 없음) ${a.person_name}`);continue;}
  const r=await probe(a.published_url); await sleep(400);
  const storedLog=logNoFromUrl(a.published_url);
  if(r.dead){dead++;console.log(`  DEAD  stored=${storedLog} ${a.person_name} "${a.title}"`);continue;}
  const fin=r.finalLog||storedLog;
  if(!byFinal.has(fin))byFinal.set(fin,[]);
  byFinal.get(fin).push({...a,storedLog,finalLog:fin,realTitle:r.title});
  if(fin!==storedLog)console.log(`  REDIR ${storedLog} → ${fin}  ${a.person_name}`);
}

// 최종 logNo 기준 중복
const collapses=[...byFinal.entries()].filter(([,v])=>v.length>1);
console.log(`\n=== 최종 logNo 기준 ===`);
console.log(`저장 발행행 ${pub.length} | dead ${dead} | 최종 distinct 글 ${byFinal.size}`);
console.log(`서로 다른 발행행이 같은 최종 글로 수렴: ${collapses.length}건`);
for(const [fin,v] of collapses){console.log(`  최종 ${fin} ← ${v.length}행`);for(const x of v)console.log(`     id=${x.id.slice(0,8)} stored=${x.storedLog} ${x.person_name} "${x.title}"`);}
