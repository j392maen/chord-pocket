const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 393, height: 759 }, deviceScaleFactor: 3 });
  const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await p.goto('file:///home/claude/app/dist/test.html'); await p.dispatchEvent('#scrTouch','pointerdown',{pointerId:1}); await p.waitForTimeout(1800);
  await p.evaluate(() => { advanceCoach(0); R.hist=[{roman:'I'},{roman:'V'},{roman:'vi'},{roman:'IV'}]; });
  await p.dispatchEvent('.key[data-i="0"]','pointerdown',{pointerId:2});
  const r = await p.evaluate(() => { const ts = []; for (let i = 0; i < 60; i++) { const t0 = performance.now(); drawScreen(); ts.push(performance.now() - t0); } ts.sort((a,b)=>a-b); return { median: ts[30].toFixed(2), p95: ts[57].toFixed(2) }; });
  console.log('6x CPU throttle, 3x DPR, chord held:', r); await b.close(); })();
