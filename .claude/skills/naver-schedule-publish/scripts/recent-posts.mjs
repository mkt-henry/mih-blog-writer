// usage: node recent-posts.mjs <blogId>  — 최근 글 13개: 발행시각 | logNo | 대표 썸네일 유무 | 제목
const b = process.argv[2];
const s = await (await fetch(`https://rss.blog.naver.com/${b}.xml`)).text();
const strip = (x) => (x || '').replace('<![CDATA[', '').replace(']]>', '').trim();
for (const it of s.split('<item>').slice(1, 14)) {
  const g = (t) => strip(it.split(`<${t}>`)[1]?.split(`</${t}>`)[0]);
  console.log(g('pubDate').slice(5, 22), '|', g('guid').split('/').pop(), '|', g('description').includes('<img') ? 'thumb' : 'NO-THUMB', '|', g('title').slice(0, 26));
}
