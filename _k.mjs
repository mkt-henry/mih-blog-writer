import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/); if(m) process.env[m[1].trim()]=m[2].trim(); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t,s,f=q=>q){let r=[],o=0;for(;;){const{data,error}=await f(db.from(t).select(s)).range(o,o+999);if(error)throw error;r=r.concat(data);if(data.length<1000)break;o+=1000;}return r;}
const kws = await all('keywords','id,keyword,category,is_active');
console.log('키워드 총', kws.length, '| 활성', kws.filter(k=>k.is_active!==false).length);
const done = new Set((await all('mih_serp_checks','query')).map(r=>r.query));
console.log('이미 검색해 본 쿼리', done.size);
const todo = kws.filter(k=>k.is_active!==false && !done.has(`${k.keyword} 섭외`));
console.log('아직 안 해본 인물', todo.length);
console.log('예시:', todo.slice(0,5).map(k=>k.keyword).join(', '));
