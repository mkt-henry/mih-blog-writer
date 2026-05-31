#!/usr/bin/env node
import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const [, , slug] = process.argv;
const articles = await supabaseSelect('articles', {
  columns: 'person_name,agency,slug,instagram_url,html_content',
  filter: `slug=eq.${encodeURIComponent(slug)}&published_at=is.null`,
});

if (!articles.length) { console.log('없음'); process.exit(1); }
const a = articles[0];
console.log(`[${a.agency}] ${a.person_name}`);
console.log(`instagram_url: ${a.instagram_url ?? '없음'}\n`);
console.log(a.html_content.slice(0, 2000));
