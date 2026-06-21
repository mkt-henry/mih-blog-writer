import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const result = config({ path: resolve(__dirname, '../.env.local') });
console.log('dotenv result:', result.error ? result.error.message : 'OK, loaded ' + Object.keys(result.parsed || {}).length + ' vars');
const keys = Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('NEXT'));
console.log('SUPABASE/NEXT env keys:', keys);
console.log('URL val:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0,30));
