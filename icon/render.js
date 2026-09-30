const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.goto('file:///home/claude/app/icon/icon.html'); await p.waitForTimeout(300);
  await (await p.$('#c')).screenshot({ path: '/home/claude/app/ios/ChordPocket/Assets.xcassets/AppIcon.appiconset/icon-1024.png' }); await b.close(); })();
