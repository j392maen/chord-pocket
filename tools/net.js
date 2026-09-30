const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const reqs = [];
  p.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });
  await p.goto('file:///home/claude/app/dist/test.html'); await p.waitForTimeout(1500);
  const rm = await b.newPage({ reducedMotion: 'reduce' }); await rm.goto('file:///home/claude/app/dist/test.html');
  const dur = await rm.evaluate(() => getComputedStyle(document.getElementById('knob')).transitionDuration);
  const unlabeled = await p.evaluate(() => [...document.querySelectorAll('button,[role=button],[role=slider]')].filter(e => !e.getAttribute('aria-label') && !e.textContent.trim() && !e.closest('#scrTouch')).length);
  console.log('external requests:', reqs.length ? reqs : 'none', '| reduced-motion knob transition:', dur, '| unlabeled controls:', unlabeled);
  await b.close(); })();
