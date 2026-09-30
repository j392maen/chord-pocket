const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 393, height: 759 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__msgs = [];
    window.webkit = { messageHandlers: { cp: { postMessage: m => {
      window.__msgs.push(JSON.parse(JSON.stringify(m)));
      if (m.op === 'ping') setTimeout(() => NativeEngine._pong(m.p, performance.now() / 1000 + 5000), 3);
      if (m.op === 'scope') setTimeout(() => NativeEngine._scopeIn(Array.from({ length: 512 }, (_, i) => Math.sin(i / 20) * 0.3)), 3);
    } } } };
    window.__CP_SAVED = { v: 1, keyPc: 2, bpm: 128 };
  });
  await p.goto('file:///home/claude/app/dist/test.html');
  await p.dispatchEvent('#scrTouch', 'pointerdown', { pointerId: 1 }); await p.waitForTimeout(1700);
  await p.evaluate(() => advanceCoach(0));
  await p.dispatchEvent('.key[data-i="0"]', 'pointerdown', { pointerId: 2 }); await p.waitForTimeout(200);
  await p.dispatchEvent('.key[data-i="0"]', 'pointerup', { pointerId: 2 }); await p.waitForTimeout(100);
  await p.evaluate(() => { setMode('ARP'); }); await p.dispatchEvent('.key[data-i="4"]', 'pointerdown', { pointerId: 3 }); await p.waitForTimeout(800); await p.dispatchEvent('.key[data-i="4"]', 'pointerup', { pointerId: 3 });
  await p.evaluate(() => { setMode('DRUM'); }); await p.dispatchEvent('.key[data-i="0"]', 'pointerdown', { pointerId: 4 }); await p.dispatchEvent('.key[data-i="0"]', 'pointerup', { pointerId: 4 });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const flat = []; for (const m of __msgs) { if (m.op === 'batch') flat.push(...m.m); else flat.push(m); }
    const ops = {}; flat.forEach(m => ops[m.op] = (ops[m.op] || 0) + 1);
    const on = flat.find(m => m.op === 'on'), patch = flat.find(m => m.op === 'patch'), drum = flat.find(m => m.op === 'drum');
    const futureOns = flat.filter(m => m.op === 'on' && m.t > 0).length;
    return { ops, on, patchKeys: Object.keys(patch.p).length, patchSample: { eng: patch.p.eng, a: patch.p.a, voices: patch.p.voices }, drum, futureOns, key: S.keyPc, bpm: S.bpm, running: Engine.running(), isNative: Engine.isNative, save: flat.some(m => m.op === 'save') };
  });
  console.log(JSON.stringify(r, null, 1)); console.log('errors', errs);
  await b.close();
})();
