/**
 * 누적: unmatched_rss_items 의 특정 항목(또는 전체 섭외글)을 발행행으로 articles 에 등록.
 * 초안이 없는 RSS-only 발행글을 DB에 누적시키는 1회성/재사용 도구.
 *
 *   node scripts/accumulate-unmatched.mjs                 ← dry-run (지정 7건)
 *   node scripts/accumulate-unmatched.mjs --apply
 */
import { readFileSync } from 'fs';
function loadEnv(){try{const r=readFileSync('.env.local','utf8');for(const l of r.split('\n')){const m=l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);if(m&&!process.env[m[1].trim()])process.env[m[1].trim()]=m[2].trim();}}catch{}}
loadEnv();
const URL_=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
const apply=process.argv.includes('--apply');

// 재논의로 확정한 누적 대상 7건 (logNo)
const LOGNOS=['224282115581','224289500067','224278264608','224292324445','224302065197','224302064086','224302065717'];

function extractKeyword(t){const m=String(t).replace(/[ 　]/g,' ').replace(/\s+/g,' ').trim().match(/^\[([^\]]+?)(?:\s+섭외)?\]/);return m?m[1].trim():String(t).trim();}
function kstDate(ts){return new Date(ts+9*3600000).toISOString().slice(0,10);}
function logNoOf(link){const m=link.match(/\/(\d{6,})(?:\?|$)/);return m?m[1]:null;}

async function selAll(t,c){let r=[],o=0;const L=1000;while(1){const res=await fetch(`${URL_}/rest/v1/${t}?select=${c}&limit=${L}&offset=${o}`,{headers});const b=await res.json();r.push(...b);if(b.length<L)break;o+=L;}return r;}

const unmatched=await selAll('unmatched_rss_items','agency,link,title,pub_ts');
const targets=unmatched.filter(u=>LOGNOS.some(ln=>u.link.includes(ln)));
console.log(`누적 대상 ${targets.length}/${LOGNOS.length}건\n`);

// 기존 발행 URL/슬러그 충돌 체크용
const arts=await selAll('articles','agency,slug,publish_date,published_url');
const urlSet=new Set(arts.filter(a=>a.published_url).map(a=>a.published_url.replace(/\?.*$/,'')));
function slugTaken(agency,date,slug){return arts.some(a=>a.agency===agency&&a.publish_date===date&&a.slug===slug);}

let ok=0,skip=0;
for(const u of targets){
  const date=kstDate(u.pub_ts);
  const person=extractKeyword(u.title);
  const logNo=logNoOf(u.link);
  // URL 이미 발행됨? → 스킵
  if(urlSet.has(u.link.replace(/\?.*$/,''))){console.log(`SKIP(이미 발행) ${person} ${logNo}`);skip++;continue;}
  // 슬러그 충돌 시 logNo 접미
  let slug=person;
  if(slugTaken(u.agency,date,slug)) slug=`${person}-${logNo}`;
  const row={
    publish_date:date, agency:u.agency, slug, person_name:person, title:u.title,
    html_content:'<!-- RSS 누적 등록: 원본 초안 없음 -->',
    published_at:new Date(u.pub_ts).toISOString(), published_url:u.link, published_source:'rss',
    notes:'RSS 누적(초안 없음)',
  };
  console.log(`${apply?'INSERT':'(dry)'} [${u.agency}] ${date} slug=${slug} "${u.title}"`);
  if(!apply){ok++;continue;}
  const res=await fetch(`${URL_}/rest/v1/articles`,{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(row)});
  if(!res.ok){console.log(`   ✗ insert 실패 ${res.status} ${await res.text()}`);continue;}
  // unmatched 제거
  const del=await fetch(`${URL_}/rest/v1/unmatched_rss_items?agency=eq.${u.agency}&link=eq.${encodeURIComponent(u.link)}`,{method:'DELETE',headers:{...headers,Prefer:'return=minimal'}});
  console.log(`   ✓ 등록 + unmatched 제거(${del.status})`);
  ok++;
}
console.log(`\n${apply?'적용':'dry-run'}: ${ok}건 처리, ${skip}건 스킵`);
