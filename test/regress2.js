const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 393, height: 759 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/app/dist/test.html');
  await p.dispatchEvent('#scrTouch', 'pointerdown', { pointerId: 1 }); await p.waitForTimeout(1700);
  await p.evaluate(() => { advanceCoach(0); S.loopBars = 1; Tr.setBpm(120); looperClick(); looperClick(); });
  await p.waitForTimeout(2300);
  const k = i => `.key[data-i="${i}"]`;
  await p.dispatchEvent(k(0), 'pointerdown', { pointerId: 2 }); await p.waitForTimeout(500); await p.dispatchEvent(k(0), 'pointerup', { pointerId: 2 });
  await p.dispatchEvent(k(3), 'pointerdown', { pointerId: 3 }); await p.waitForTimeout(500); await p.dispatchEvent(k(3), 'pointerup', { pointerId: 3 });
  await p.waitForTimeout(1800);
  const t1 = await p.evaluate(() => ({ state: S.tracks[0].state, events: S.tracks[0].events.length, len: S.loop.len }));
  // held note across the loop end must be recorded and then released (no hang)
  await p.evaluate(() => looperClick()); await p.dispatchEvent(k(4), 'pointerdown', { pointerId: 4 }); await p.waitForTimeout(2600);
  await p.dispatchEvent(k(4), 'pointerup', { pointerId: 4 }); await p.waitForTimeout(300);
  const t2 = await p.evaluate(() => ({ state: S.tracks[1].state, events: S.tracks[1].events.length, liveUnreleased: [...R.live.voices].filter(v => v.offAt == null).length }));
  await p.evaluate(() => { setMode('SEQ'); }); for (const i of [0, 4, 5, 3]) { await p.dispatchEvent(k(i), 'pointerdown', { pointerId: 10 + i }); await p.dispatchEvent(k(i), 'pointerup', { pointerId: 10 + i }); }
  const seq = await p.evaluate(() => S.seq.steps.map(s => s && s.name));
  console.log({ t1, t2, seq }, 'errors', errs); await b.close();
})();
