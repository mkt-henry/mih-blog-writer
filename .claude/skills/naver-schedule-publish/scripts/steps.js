globalThis.W = globalThis.W || {};
globalThis.dismissDraft = async (w) => {
  const pop = w.locator('.se-popup-alert-confirm .se-popup-button-cancel');
  for (let t = 0; t < 10; t++) { if (await pop.count()) { await pop.first().click(); await sleep(800); return true; } await sleep(700); }
  return false;
};
globalThis.stepText = async (dashTab, blogId, idx) => {
  const w = await openTab('https://blog.naver.com/PostWriteForm.naver?blogId=' + blogId + '&Redirect=Write'); await sleep(5000);
  await dismissDraft(w);
  await dashTab.bringToFront(); await dashTab.locator('[data-copy-title]').nth(idx).click(); await sleep(600);
  await w.bringToFront(); await w.locator('.se-title-text').first().click(); await w.keyboard.press('Control+A'); await w.keyboard.press('Delete'); await w.keyboard.press('Control+V'); await sleep(800);
  await dashTab.bringToFront(); await dashTab.locator('[data-copy-body]').nth(idx).click(); await sleep(1500);
  await w.bringToFront(); await w.getByText('글감과 함께 나의 일상을 기록해보세요!').first().click(); await sleep(300); await w.keyboard.press('Control+V'); await sleep(10000);
  for (let k = 0; k < 6; k++) { await w.evaluate((k) => { const im = [...document.querySelectorAll('.se-component.se-image')]; if (im[k]) im[k].scrollIntoView({block: 'center'}); }, k); await sleep(1200); }
  W[idx] = w;
  return await w.evaluate(() => ({
    title: document.querySelector('.se-title-text').innerText,
    comps: document.querySelectorAll('.se-component').length,
    tables: document.querySelectorAll('.se-component table').length,
    videos: document.querySelectorAll('.se-oembed, .se-video').length,
    firstImg: [...document.querySelectorAll('.se-component.se-image img')].map(i => i.src).find(s => s.startsWith('http')) || '',
  }));
};
globalThis.setDate = async (w, ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const want = `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}`;
  const cur = () => w.evaluate(() => [...document.querySelectorAll('input')].find(i => /\d{4}\. \d{2}/.test(i.value))?.value);
  if (await cur() === want) return want;
  await w.locator('input[class*="input_date"]').click(); await sleep(800);
  for (let k = 0; k < 3; k++) {
    const ym = await w.evaluate(() => [document.querySelector('.ui-datepicker-year')?.innerText, document.querySelector('.ui-datepicker-month')?.innerText]);
    if (Number(ym[0]) === y && parseInt(ym[1]) === m) break;
    await w.locator('.ui-datepicker-next').click(); await sleep(500);
  }
  await w.locator('.ui-datepicker tbody button', {hasText: new RegExp('^' + d + '$')}).first().click(); await sleep(800);
  return await cur();
};
globalThis.stepFinish = async (idx, url, ymd, hh, mm) => {
  const w = W[idx]; await w.bringToFront();
  if (await w.getByRole('button', {name: '발행 설정 닫기'}).count()) { await w.getByRole('button', {name: '발행 설정 닫기'}).click(); await sleep(600); }
  const i0 = await w.evaluate((u) => [...document.querySelectorAll('.se-component')].findIndex(c => c.classList.contains('se-image') && [...c.querySelectorAll('img')].some(i => i.src === u)), url);
  if (i0 < 0) return {err: 'image not found'};
  const pt = async (i) => w.evaluate((i) => { const c = document.querySelectorAll('.se-component')[i]; c.scrollIntoView({block: 'center'}); const b = c.querySelector('img').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, i);
  let p = await pt(i0); await w.mouse.click(p[0], p[1]); await sleep(600);
  await w.keyboard.press('Control+V'); await sleep(8000);
  const up = await w.evaluate((i) => { const c = document.querySelectorAll('.se-component')[i + 1]; return !!c && c.classList.contains('se-image') && /pstatic\.net/.test(c.querySelector('img')?.src || '') && c.innerText.includes('대표'); }, i0);
  if (!up) return {err: 'upload not detected', i0};
  p = await pt(i0); await w.mouse.click(p[0], p[1]); await sleep(500); await w.keyboard.press('Delete'); await sleep(1000);
  const img = await w.evaluate((a) => { const cs = [...document.querySelectorAll('.se-component')]; return {stillOld: cs.some(c => [...c.querySelectorAll('img')].some(i => i.src === a.u)), rep: cs[a.i].classList.contains('se-image') && cs[a.i].innerText.includes('대표'), caption: cs[a.i + 1]?.innerText.slice(0, 30)}; }, {u: url, i: i0});
  await w.getByRole('button', {name: '저장', exact: true}).first().click(); await sleep(2000);
  await w.locator('button[data-click-area="tpb.publish"]').first().click(); await sleep(1500);
  await w.getByText('예약', {exact: true}).first().click(); await sleep(1000);
  const date = await setDate(w, ymd);
  await w.locator('select[class*="hour_option"]').selectOption(hh); await w.locator('select[class*="minute_option"]').selectOption(mm); await sleep(500);
  const sched = await w.evaluate(() => [...document.querySelectorAll('input[type=radio]:checked')].map(r => r.nextElementSibling?.innerText).join(',') + ' ' + [...document.querySelectorAll('select')].map(s => s.value).join(':'));
  return {img, date, sched};
};
globalThis.doPublish = async (idx, ymd, hh, mm) => {
  const w = W[idx]; await w.bringToFront();
  const [y, m, d] = ymd.split('-');
  const want = `${y}. ${m}. ${d} ${hh}:${mm}`;
  const pre = await w.evaluate(() => ({on: [...document.querySelectorAll('input[type=radio]:checked')].map(r => r.nextElementSibling?.innerText).join(','), time: [...document.querySelectorAll('input')].filter(i => /\d{4}\. \d{2}/.test(i.value)).map(i => i.value).join('') + ' ' + [...document.querySelectorAll('select')].map(s => s.value).join(':'), title: document.querySelector('.se-title-text').innerText}));
  if (!pre.on.includes('예약') || pre.time !== want) return {err: 'schedule mismatch', want, pre};
  await w.locator('button[data-click-area="tpb*i.publish"]').click();
  for (let k = 0; k < 10 && !/logNo=/.test(w.url()); k++) await sleep(2000);
  const logNo = (w.url().match(/logNo=(\d+)/) || [])[1];
  return logNo ? {ok: true, logNo, title: pre.title} : {err: 'no logNo after publish', url: w.url(), title: pre.title};
};
globalThis.markReserved = async (dashTab, titles) => {
  await dashTab.reload(); await sleep(4000);
  const items = await dashTab.evaluate(() => [...document.querySelectorAll('input[data-scheduled-checkbox]')].map(cb => { let el = cb, txt = ''; for (let k = 0; k < 8 && el; k++) { el = el.parentElement; if (el && el.innerText.includes('섭외]')) { txt = el.innerText.split('\n')[0]; break; } } return {id: cb.getAttribute('data-post-id'), checked: cb.checked, title: txt}; }));
  const out = [];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();   /* 네이버 편집기 제목은 공백이 NBSP 라 그대로 비교하면 안 맞는다 */
  const want = titles.map(norm);
  for (const t of items.filter(it => !it.checked && want.includes(norm(it.title)))) {
    const s = await dashTab.evaluate(async (id) => (await fetch('/api/feed/reserve', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, reserved: true})})).status, t.id);
    out.push(t.title.slice(0, 20) + ' ' + s);
  }
  return out;
};

globalThis.repFirst = async (w, url) => {
  await w.bringToFront();
  const i0 = await w.evaluate((u) => [...document.querySelectorAll('.se-component')].findIndex(c => c.classList.contains('se-image') && [...c.querySelectorAll('img')].some(i => i.src === u)), url);
  if (i0 < 0) return {err: 'image not found'};
  const pt = async (i) => w.evaluate((i) => { const c = document.querySelectorAll('.se-component')[i]; c.scrollIntoView({block: 'center'}); const b = c.querySelector('img').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, i);
  let p = await pt(i0); await w.mouse.click(p[0], p[1]); await sleep(600);
  await w.keyboard.press('Control+V'); await sleep(8000);
  const up = await w.evaluate((i) => { const c = document.querySelectorAll('.se-component')[i + 1]; return !!c && c.classList.contains('se-image') && /pstatic\.net/.test(c.querySelector('img')?.src || '') && c.innerText.includes('대표'); }, i0);
  if (!up) return {err: 'upload not detected', i0};
  p = await pt(i0); await w.mouse.click(p[0], p[1]); await sleep(500); await w.keyboard.press('Delete'); await sleep(1000);
  return await w.evaluate((a) => { const cs = [...document.querySelectorAll('.se-component')]; return {stillOld: cs.some(c => [...c.querySelectorAll('img')].some(i => i.src === a.u)), rep: cs[a.i].classList.contains('se-image') && cs[a.i].innerText.includes('대표'), caption: cs[a.i + 1]?.innerText.slice(0, 30), n: cs.length}; }, {u: url, i: i0});
};
globalThis.openEdit = async (blogId, logNo) => {
  globalThis.E = await openTab('https://blog.naver.com/PostUpdateForm.naver?blogId=' + blogId + '&logNo=' + logNo); await sleep(6000);
  await dismissDraft(E);
  for (let k = 0; k < 6; k++) { await E.evaluate((k) => { const im = [...document.querySelectorAll('.se-component.se-image')]; if (im[k]) im[k].scrollIntoView({block: 'center'}); }, k); await sleep(1200); }
  return await E.evaluate(() => ({title: document.querySelector('.se-title-text')?.innerText.slice(0, 20), hasRep: [...document.querySelectorAll('.se-component.se-image')].some(c => c.innerText.includes('대표')), firstImg: [...document.querySelectorAll('.se-component.se-image img')].map(i => i.src).find(s => s.startsWith('http')) || ''}));
};
globalThis.fixAndSave = async (url) => {
  const r = await repFirst(E, url);
  if (r.err || r.stillOld || !r.rep) return r;
  await E.locator('button[data-click-area="tpb.publish"]').first().click(); await sleep(1500);
  await E.locator('button[data-click-area="tpb*i.publish"]').click(); await sleep(6000);
  return {...r, saved: /PostView/.test(E.url())};
};
console.log('STEPS ok');
