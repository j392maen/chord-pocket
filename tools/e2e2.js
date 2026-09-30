const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const errs=[]; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///home/claude/app/dist/test.html');
  const w = ms => page.waitForTimeout(ms);
  await page.dispatchEvent('.key[data-i="0"]','pointerdown',{pointerId:1}); await page.dispatchEvent('.key[data-i="0"]','pointerup',{pointerId:1});
  await page.evaluate(() => { const a = AudioSys.ctx.createAnalyser(); a.fftSize = 2048; AudioSys.limiter.connect(a); window.__an = a; S.loopBars=1; Tr.setBpm(120); });
  const rms = () => page.evaluate(() => { const a = window.__an; const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s=0; for (const x of d) s+=x*x; return Math.sqrt(s/d.length); });
  await page.evaluate(() => { looperClick(); looperClick(); });
  await w(2200);
  console.log('rec', await page.evaluate(()=>R.rec&&R.rec.active));
  for (const i of [0,3]) { await page.dispatchEvent(`.key[data-i="${i}"]`,'pointerdown',{pointerId:2}); await w(400); await page.dispatchEvent(`.key[data-i="${i}"]`,'pointerup',{pointerId:2}); await w(300); }
  await w(1000);
  console.log(await page.evaluate(()=>({st:S.tracks[0].state, ev:JSON.stringify(S.tracks[0].events.map(e=>[e.m,+e.b.toFixed(2),+e.d.toFixed(2)]))})));
  let mx=0, samples=[]; for (let k=0;k<25;k++){ const r=await rms(); samples.push(r.toFixed(3)); mx=Math.max(mx,r); await w(100);} 
  console.log('playback samples', samples.join(' '), 'max', mx.toFixed(3), 'trackVoices', await page.evaluate(()=>R.trackCh[0].voices.size));
  // key screen shows?
  await page.screenshot({path:'shot7.png'});
  await page.evaluate(()=>setMode('ARP')); await page.dispatchEvent('.key[data-i="5"]','pointerdown',{pointerId:3}); await w(1500);
  console.log('arp live voices', await page.evaluate(()=>R.live.voices.size));
  await page.dispatchEvent('.key[data-i="5"]','pointerup',{pointerId:3});
  console.log('errors', errs);
  await browser.close();
})();
