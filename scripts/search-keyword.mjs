import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const q = process.argv[2] || '';
const { data, error } = await sb.from('keywords').select('keyword,category,agency,published_url').ilike('keyword', `%${q}%`);
if(error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
