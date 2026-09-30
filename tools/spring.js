const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 393, height: 759 } });
  await page.goto('file:///home/claude/app/dist/test.html');
  const jb = await (await page.$('#joy')).boundingBox(); const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
  const trace = await page.evaluate(async ({cx, cy}) => {
    const el = document.getElementById('joy'), k = document.getElementById('knob');
    const ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', cx, cy); ev('pointermove', cx + 70, cy);
    await new Promise(r => setTimeout(r, 100));
    const out = []; const t0 = performance.now(); ev('pointerup', cx + 70, cy);
    await new Promise(res => { const f = () => { const m = new DOMMatrix(getComputedStyle(k).transform); out.push([Math.round(performance.now() - t0), +m.m41.toFixed(2)]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return out;
  }, {cx, cy});
  console.log(JSON.stringify(trace));
  await browser.close();
})();
