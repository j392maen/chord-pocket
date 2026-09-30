const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto('file:///home/claude/app/dist/test.html');
  await page.dispatchEvent('.key[data-i="0"]','pointerdown',{pointerId:1}); await page.dispatchEvent('.key[data-i="0"]','pointerup',{pointerId:1});
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async () => {
    const a = AudioSys.ctx.createAnalyser(); a.fftSize = 2048; AudioSys.limiter.connect(a);
    const rms = () => { const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s=0; for (const x of d) s+=x*x; return Math.sqrt(s/d.length); };
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const out = {};
    let v = R.live.noteOn(60, 0.8, AudioSys.now()); await sleep(200); out.live = rms(); R.live.noteOff(v, AudioSys.now()); await sleep(1500);
    const g = AudioSys.ctx.createGain(); g.connect(AudioSys.master);
    const ch = new Channel(S.patch, g);
    v = ch.noteOn(60, 0.8, AudioSys.now()); await sleep(200); out.newch = rms(); ch.noteOff(v, AudioSys.now()); await sleep(1500);
    const t0 = AudioSys.now()+0.05; v = ch.noteOn(60, 0.8, t0); ch.noteOff(v, t0+0.4); await sleep(250); out.sched = rms(); await sleep(1500);
    return out;
  });
  console.log(res);
  await browser.close();
})();
