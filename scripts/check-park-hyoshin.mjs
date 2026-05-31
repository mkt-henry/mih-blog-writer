import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';
loadEnv();
const articles = await supabaseSelect('articles', {
  columns: 'html_content',
  filter: 'slug=eq.' + encodeURIComponent('박효신') + '&published_at=is.null',
});
const html = articles[0].html_content;
const imgs = [...html.matchAll(/src="(https?:\/\/[^"]+)"/gi)].map(m => m[1]);
imgs.forEach((u, i) => console.log(i + 1, u.substring(0, 90)));
