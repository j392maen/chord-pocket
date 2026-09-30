const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 393, height: 759 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto('file:///home/claude/app/dist/test.html');
  const bez = await (await page.$('.bezel')).boundingBox();
  const t0 = Date.now(); const frames = [];
  for (const t of [150, 400, 650, 900, 1300, 1900]) { while (Date.now() - t0 < t) await page.waitForTimeout(5); await page.screenshot({ path: `shots/m-boot-${t}.png`, clip: bez }); }
  await page.dispatchEvent('#scrTouch', 'pointerdown', { pointerId: 1 }); await page.waitForTimeout(1600);
  await page.evaluate(() => advanceCoach(0));
  const keyBox = await (await page.$('.keys')).boundingBox(); const joyBox = await (await page.$('.joyrow')).boundingBox();
  const region = { x: 0, y: keyBox.y - 6, width: 393, height: joyBox.y + joyBox.height - keyBox.y + 6 };
  await page.screenshot({ path: 'shots/m-key-0.png', clip: region });
  await page.dispatchEvent('.key[data-i="5"]', 'pointerdown', { pointerId: 5 });
  await page.waitForTimeout(40); await page.screenshot({ path: 'shots/m-key-1.png', clip: region });
  const jb = await (await page.$('#joy')).boundingBox(); const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
  await page.dispatchEvent('#joy', 'pointerdown', { pointerId: 50, clientX: cx, clientY: cy });
  await page.dispatchEvent('#joy', 'pointermove', { pointerId: 50, clientX: cx + 55, clientY: cy - 50 });
  await page.waitForTimeout(80); await page.screenshot({ path: 'shots/m-key-2.png', clip: region });
  await page.dispatchEvent('#joy', 'pointerup', { pointerId: 50 });
  for (const t of [30, 90, 160, 300]) { await page.waitForTimeout(t === 30 ? 30 : t - [30, 90, 160, 300][[30, 90, 160, 300].indexOf(t) - 1]); await page.screenshot({ path: `shots/m-spring-${t}.png`, clip: region }); }
  await browser.close();
})();
