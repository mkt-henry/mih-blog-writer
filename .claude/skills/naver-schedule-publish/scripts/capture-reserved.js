{ const p = await attachBrowserTab(TID); await sleep(1500);
  for (let i = 0; i < 10; i++) { const q = p.locator('.se-popup-alert-confirm .se-popup-button-cancel'); if (await q.count()) { await q.first().click(); await sleep(800); break; } await sleep(500); }
  if (!(await p.locator('[class*=popup_container]').count())) { await p.getByRole('button', {name: /예약 발행/}).first().click(); await sleep(2500); }
  const info = await p.evaluate(() => { const e = document.querySelector('[class*=popup_container]'); const b = e.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, iw: innerWidth, txt: e.innerText.replace(/\s+/g, ' ').slice(0, 400)}; });
  /* 기존 창에 새로 붙은 탭은 첫 캡처가 멈추고 두 번째부터 된다(2026-10-14 시험) → 다시 시도한다. run.sh 가 한 줄로 이어 붙이니 // 주석 금지 */
  for (let i = 1; ; i++) { try { await p.bringToFront(); await sleep(800); await p.screenshot({path: './artifacts/reserved_full.png', timeout: 10000}); break; } catch (e) { if (i >= 3) throw e; } }
  console.log('CAP', JSON.stringify(info)); }
