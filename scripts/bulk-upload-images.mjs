import { put } from '@vercel/blob';
import { readFileSync } from 'fs';
const raw = readFileSync('.env.local', 'utf8');
for (const l of raw.split('\n')) { const m = l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/); if (m) process.env[m[1].trim()] = m[2].trim(); }
const SB_URL = 'https://djtmniygzdbavxwrppxb.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BLOB   = process.env.BLOB_READ_WRITE_TOKEN;
const BUCKET = 'article-images';

const artists = {
  'hwang-chiyeol': [
    'https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/705420440_18594290659052891_2694821872407380817_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gFoPijq5djJmIMbrjt-mf7p2LLp2bzC10o1QoQBOivepE8N8-WJvLhlsacrtMwVFTg&_nc_ohc=cMBKwcTJZI0Q7kNvwEk9RL5&_nc_gid=a1XpvcB3ZAH8oQdao81lYA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzkwMzM4NDMyMzY4ODg0NTM2Ng%3D%3D.3-ccb7-5&oh=00_Af5TirC9ClrvIcWXYjzL4cMxiOwm7J9NCLa6s2Sejxxvgg&oe=6A1EAAAA&_nc_sid=8b3546',
    'https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/706065363_18594290668052891_3915470847077459460_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gFoPijq5djJmIMbrjt-mf7p2LLp2bzC10o1QoQBOivepE8N8-WJvLhlsacrtMwVFTg&_nc_ohc=6e2WIMTTeB0Q7kNvwE5QE8Q&_nc_gid=a1XpvcB3ZAH8oQdao81lYA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzkwMzM4NDMyODMxOTUyMjA2Nw%3D%3D.3-ccb7-5&oh=00_Af5KgfHNyeKCvt8dYxb2VT17d9gxDhtuQn0dJWMN-7FZ1g&oe=6A1EA583&_nc_sid=8b3546',
    'https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/705102555_18594290689052891_6670303183258721599_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gFoPijq5djJmIMbrjt-mf7p2LLp2bzC10o1QoQBOivepE8N8-WJvLhlsacrtMwVFTg&_nc_ohc=Vy_OnrkeOhIQ7kNvwFiOifM&_nc_gid=a1XpvcB3ZAH8oQdao81lYA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzkwMzM4NDMzMTkyNjM5MjY1Nw%3D%3D.3-ccb7-5&oh=00_Af5jw0yrfZtXWZkf-C9aEmoxqm1RWzc32-kbn9q3SHbc5w&oe=6A1EBA61&_nc_sid=8b3546',
    'https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/705662289_18594290680052891_1436011844312576940_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gFoPijq5djJmIMbrjt-mf7p2LLp2bzC10o1QoQBOivepE8N8-WJvLhlsacrtMwVFTg&_nc_ohc=XwnBKfGIpfcQ7kNvwEerWbx&_nc_gid=a1XpvcB3ZAH8oQdao81lYA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzkwMzM4NDMzNjEwNDE0MjIwMA%3D%3D.3-ccb7-5&oh=00_Af5ofSXV7WHL43PoqEJlwkwqEsIpQirFjmY-TB50bl1FVQ&oe=6A1EB194&_nc_sid=8b3546',
  ],
  'k-will': [
    'https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/702516003_17996981582957720_8587809998305328658_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-1.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2gFJx0dg5P13_KzuUFBOVO8NpGVnpFhUuXlBhG9OB1cbhTVqBxkCq8kx4qtK0DTpHe0&_nc_ohc=TzvnyKXjeY8Q7kNvwH3feki&_nc_gid=orbcvUXkO21i4xMOFEQilw&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzkwMjUyMTUxNjg5ODkwMTk5Ng%3D%3D.3-ccb7-5&oh=00_Af5FPIx0gOqMsq18LeZAz_uImmIh75VkG0B1e9Pb00pBGw&oe=6A1EA567&_nc_sid=8b3546',
    'https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/702465557_18410493979195754_8682591364334899372_n.heic?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFJx0dg5P13_KzuUFBOVO8NpGVnpFhUuXlBhG9OB1cbhTVqBxkCq8kx4qtK0DTpHe0&_nc_ohc=ekE0Ie8I-vUQ7kNvwGuGZhY&_nc_gid=orbcvUXkO21i4xMOFEQilw&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzg5OTg0NDA2NzcyNzEwNTkwNg%3D%3D.3-ccb7-5&oh=00_Af4q_yJgDg3JzwCjOSxkZtKzO1vGwmDAKqWSUcE8kw43lw&oe=6A1EBF9E&_nc_sid=8b3546',
    'https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/700890374_18410493991195754_3041724980348872164_n.heic?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2gFJx0dg5P13_KzuUFBOVO8NpGVnpFhUuXlBhG9OB1cbhTVqBxkCq8kx4qtK0DTpHe0&_nc_ohc=I0azlc0l3wAQ7kNvwE6WBky&_nc_gid=orbcvUXkO21i4xMOFEQilw&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzg5OTg0NDA3NTAwODQyMDU0MQ%3D%3D.3-ccb7-5&oh=00_Af6v_KugoQbR4rEQqEtVgyvANaS8HgPkz7K2ZEnhw-MNhw&oe=6A1EA632&_nc_sid=8b3546',
    'https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/689538535_17996083484957720_5588007019823364638_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ord5-1.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2gFJx0dg5P13_KzuUFBOVO8NpGVnpFhUuXlBhG9OB1cbhTVqBxkCq8kx4qtK0DTpHe0&_nc_ohc=s-C6Km6YrdQQ7kNvwEpr1cF&_nc_gid=orbcvUXkO21i4xMOFEQilw&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzg5NzQ0ODAwNzk2MTA4NDU2MQ%3D%3D.3-ccb7-5&oh=00_Af7UVnvKhzjM07S_T8m7pbC4sl3TjEMGkDCwxWlcikzzLQ&oe=6A1EB1FE&_nc_sid=8b3546',
  ],
  'lee-seunggi': [
    'https://scontent-sjc6-1.cdninstagram.com/v/t51.82787-15/582841526_18534845938065499_6016798819009954679_n.jpg?stp=dst-jpg_e35_s1080x1080_sh2.08_tt6&_nc_ht=scontent-sjc6-1.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2gHomM16B-iEvDNGwI8ZJ-vUXzWV2PwrUryojspCJ-MvqrV-7HASDR9xu0yzZcPzMpA&_nc_ohc=2eoqT_T-E_wQ7kNvwE7Sh6d&_nc_gid=DqfRPsbxht3BVj1KKdnPrA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzc2ODQ4ODQ0NDA0Njg1NjMxMg%3D%3D.3-ccb7-5&oh=00_Af6IIxlUSIkupXMiwcOl7pEXjr7g13K0UsWIFR-JJUhCOA&oe=6A1EBBE3&_nc_sid=8b3546',
    'https://scontent-sjc6-1.cdninstagram.com/v/t51.82787-15/581102989_18533746720065499_417974704843777233_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-sjc6-1.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2gHomM16B-iEvDNGwI8ZJ-vUXzWV2PwrUryojspCJ-MvqrV-7HASDR9xu0yzZcPzMpA&_nc_ohc=fUhb0UXKdOkQ7kNvwEQRDkm&_nc_gid=DqfRPsbxht3BVj1KKdnPrA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzc2MzM5NzA4NTI1MDIxNjI0Ng%3D%3D.3-ccb7-5&oh=00_Af7DcGSpRoNxG0vRMEX09ZK-D9mIUAEYq8tqQhzm_TGm0g&oe=6A1E946E&_nc_sid=8b3546',
    'https://scontent-sjc6-1.cdninstagram.com/v/t51.82787-15/581410500_18533746729065499_8342887307978781880_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-sjc6-1.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2gHomM16B-iEvDNGwI8ZJ-vUXzWV2PwrUryojspCJ-MvqrV-7HASDR9xu0yzZcPzMpA&_nc_ohc=oqbalvdP_BMQ7kNvwFTHva1&_nc_gid=DqfRPsbxht3BVj1KKdnPrA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzc2MzM5NzA4NTI1MDIxOTI0Nw%3D%3D.3-ccb7-5&oh=00_Af7B-lWS5IaQnzmtHlF75dcmnfDlaiRQIfWsNeSZGQWHfw&oe=6A1E9AFF&_nc_sid=8b3546',
    'https://scontent-sjc6-1.cdninstagram.com/v/t51.82787-15/581837766_18533746738065499_8675371201050024903_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-sjc6-1.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2gHomM16B-iEvDNGwI8ZJ-vUXzWV2PwrUryojspCJ-MvqrV-7HASDR9xu0yzZcPzMpA&_nc_ohc=FHiM9LKvEQ4Q7kNvwHY9l5F&_nc_gid=DqfRPsbxht3BVj1KKdnPrA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzc2MzM5NzA4NTI1MDI0MjAyMg%3D%3D.3-ccb7-5&oh=00_Af6MjaaZHQpHyOwG6o-XZinowXDQyArd0VNhiCP70pyHZA&oe=6A1EC1E7&_nc_sid=8b3546',
  ],
  'hong-ja': [
    'https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/650704011_17997530873865546_3104188803391092513_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=106&_nc_oc=Q6cZ2gEDXKIh_lFYQYJHRoAGv5-H3DJZAj6ys4XHmBgLCqJpechmhUSncTNPXpmKn9XOQNM&_nc_ohc=4Q2OdYJtsXgQ7kNvwEFUHV6&_nc_gid=2NNYqipF4HPP8eIW5nZoLQ&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzI2NjIyOTI5MDE2NTI3NDY2Ng%3D%3D.3-ccb7-5&oh=00_Af5Tg4juIB2V60vkMxq4ktMsjX8yG5uB6CyaJHgkmBlbpQ&oe=6A1EB2D3&_nc_sid=8b3546',
    'https://scontent-dfw5-1.cdninstagram.com/v/t51.82787-15/655834981_18108652018630005_7733690522982960356_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=109&_nc_oc=Q6cZ2gEDXKIh_lFYQYJHRoAGv5-H3DJZAj6ys4XHmBgLCqJpechmhUSncTNPXpmKn9XOQNM&_nc_ohc=ZTpjEN4tlAQQ7kNvwGtsW41&_nc_gid=2NNYqipF4HPP8eIW5nZoLQ&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzI2NjIyOTI5MDE5MDM3ODQ0OA%3D%3D.3-ccb7-5&oh=00_Af6XSjrW8BlrRCQ1z4hpF6itb31JTnvGGyu6qNoKH1oR6Q&oe=6A1EB13F&_nc_sid=8b3546',
    'https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/652742096_18058000541437371_8634122448840697044_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2gEDXKIh_lFYQYJHRoAGv5-H3DJZAj6ys4XHmBgLCqJpechmhUSncTNPXpmKn9XOQNM&_nc_ohc=bMznsRslYpkQ7kNvwF46qIL&_nc_gid=2NNYqipF4HPP8eIW5nZoLQ&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzI2NjIyOTI5MDE4MjAyMjcxNA%3D%3D.3-ccb7-5&oh=00_Af6yArh3IqrratXJlnfNUfB-7dtHbSYB5bsxQEahWhiHLg&oe=6A1EBB8E&_nc_sid=8b3546',
    'https://scontent-dfw5-1.cdninstagram.com/v/t51.82787-15/658244311_18584218861013771_2439808065258581799_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gEDXKIh_lFYQYJHRoAGv5-H3DJZAj6ys4XHmBgLCqJpechmhUSncTNPXpmKn9XOQNM&_nc_ohc=057kNd1ae30Q7kNvwEMJfJ8&_nc_gid=2NNYqipF4HPP8eIW5nZoLQ&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=MzI2NjIyOTI5MDE3MzU2MTc3NQ%3D%3D.3-ccb7-5&oh=00_Af5sYy2eSXEZUJKUUZIx1nkGxltX6Ng1K7vTks2ASj84sg&oe=6A1EA736&_nc_sid=8b3546',
  ],
};

async function uploadArtist(slug, urls) {
  console.log(`\n[${slug}] 업로드 시작`);
  for (let i = 0; i < urls.length; i++) {
    process.stdout.write(`  img${i+1}: `);
    const r = await fetch(urls[i], { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' } });
    if (!r.ok) { console.log(`✗ ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${slug}/img${i+1}.jpg`, {
      method: 'POST', headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: buf
    });
    await put(`${BUCKET}/${slug}/img${i+1}.jpg`, buf, {
      access: 'public', contentType: 'image/jpeg', contentDisposition: 'inline',
      addRandomSuffix: false, allowOverwrite: true, token: BLOB, cacheControlMaxAge: 31536000,
    });
    console.log(`✓ (${buf.length}B)`);
  }
}

for (const [slug, urls] of Object.entries(artists)) {
  await uploadArtist(slug, urls);
}
console.log('\n완료!');
