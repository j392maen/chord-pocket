const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 393, height: 759 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/app/dist/test.html');
  await p.dispatchEvent('#scrTouch', 'pointerdown', { pointerId: 1 }); await p.waitForTimeout(1700);
  await p.evaluate(() => { advanceCoach(0); const a = AudioSys.ctx.createAnalyser(); a.fftSize = 2048; AudioSys.limiter.connect(a); window.__an = a; });
  const rms = () => p.evaluate(() => { const d = new Float32Array(2048); __an.getFloatTimeDomainData(d); return +Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length).toFixed(3); });
  const k = i => `.key[data-i="${i}"]`, out = {};
  for (const m of ['PLAY', 'STRUM', 'LEAD', 'ARP', 'REPEAT']) {
    await p.evaluate(m => setMode(m), m);
    await p.dispatchEvent(k(0), 'pointerdown', { pointerId: 5 }); await p.waitForTimeout(1500);
    out[m + ' held 1.5s'] = await rms();
    await p.dispatchEvent(k(0), 'pointerup', { pointerId: 5 }); await p.waitForTimeout(3500);
    out[m + ' released'] = await rms();
  }
  await p.evaluate(() => setMode('DRONE'));
  await p.dispatchEvent(k(2), 'pointerdown', { pointerId: 6 }); await p.dispatchEvent(k(2), 'pointerup', { pointerId: 6 }); await p.waitForTimeout(2000);
  out['DRONE after release (should sound)'] = await rms();
  await p.dispatchEvent(k(2), 'pointerdown', { pointerId: 7 }); await p.dispatchEvent(k(2), 'pointerup', { pointerId: 7 }); await p.waitForTimeout(3500);
  out['DRONE toggled off'] = await rms();
  // held chord + joystick change still re-voices
  await p.evaluate(() => setMode('PLAY'));
  await p.dispatchEvent(k(5), 'pointerdown', { pointerId: 8 }); await p.evaluate(() => onJoyDir('R')); await p.waitForTimeout(800);
  out['held Am + stick R'] = await p.evaluate(() => R.lastChord.name + ' rms ' + 0) ; out['held Am + stick R rms'] = await rms();
  await p.evaluate(() => onJoyDir('C')); await p.dispatchEvent(k(5), 'pointerup', { pointerId: 8 }); await p.waitForTimeout(3500);
  out['after'] = await rms();
  console.log(out, 'errors', errs); await b.close();
})();
