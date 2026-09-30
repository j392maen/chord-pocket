// Reproduce: rapid presses on the same chord key leave notes sounding forever.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const MODE = process.env.MODE || 'PLAY';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 393, height: 759 }, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/app/dist/test.html');
  await p.dispatchEvent('#scrTouch', 'pointerdown', { pointerId: 1 }); await p.waitForTimeout(1700);
  await p.evaluate(m => { advanceCoach(0); setMode(m); const a = AudioSys.ctx.createAnalyser(); a.fftSize = 2048; AudioSys.limiter.connect(a); window.__an = a; }, MODE);
  const k = '.key[data-i="0"]';
  const down = id => p.dispatchEvent(k, 'pointerdown', { pointerId: id });
  const up = id => p.dispatchEvent(k, 'pointerup', { pointerId: id });
  const stuck = () => p.evaluate(() => ({ unreleased: [...R.live.voices].filter(v => v.offAt == null && !v.ended).length, held: R.held.size,
    rms: (() => { const d = new Float32Array(2048); __an.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length); })() }));
  // A: two fingers alternating on the same key (the second finger lands before the first lifts)
  for (let r = 0; r < 5; r++) { await down(10 + r * 2); await p.waitForTimeout(15); await down(11 + r * 2); await p.waitForTimeout(15); await up(10 + r * 2); await p.waitForTimeout(15); await up(11 + r * 2); await p.waitForTimeout(15); }
  await p.waitForTimeout(4500);
  console.log(MODE, 'A two-finger rapid taps  →', JSON.stringify(await stuck()));
  await p.evaluate(() => panic()); await p.waitForTimeout(3500);
  // B: one finger, very fast taps
  for (let r = 0; r < 12; r++) { await down(50 + r); await p.waitForTimeout(8); await up(50 + r); await p.waitForTimeout(8); }
  await p.waitForTimeout(4500);
  console.log(MODE, 'B one-finger rapid taps  →', JSON.stringify(await stuck()));
  // C: after A-type sticking, does pressing another key stop it?
  await p.evaluate(() => panic()); await p.waitForTimeout(3500);
  await down(90); await down(91); await up(90); await up(91);
  await p.dispatchEvent('.key[data-i="3"]', 'pointerdown', { pointerId: 92 }); await p.waitForTimeout(100); await p.dispatchEvent('.key[data-i="3"]', 'pointerup', { pointerId: 92 });
  await p.waitForTimeout(4500);
  console.log(MODE, 'C then press another key →', JSON.stringify(await stuck()));
  console.log('errors', errs);
  await b.close();
})();
