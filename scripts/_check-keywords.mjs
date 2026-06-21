import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('keywords').select('*').in('keyword',['유성남','또솔','황석영','래준&양양','이형택','정혁','소찬휘','심진화','더넛츠','체리블렛','임혁필','하이브로밴드']).limit(20);
if (error) console.error(error);
else console.log(JSON.stringify(data, null, 2));
