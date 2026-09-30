const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto('file:///home/claude/app/dist/test.html');
  await page.screenshot({ path: 'shot0.png' });
  const w = ms => page.waitForTimeout(ms);
  // install analyser
  const rms = async () => page.evaluate(() => { const a = window.__an; if(!a) return 0; const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s=0; for (const x of d) s+=x*x; return Math.sqrt(s/d.length); });
  const key = async (i, ms=400, during) => { const el = await page.$(`.key[data-i="${i}"]`); const b = await el.boundingBox();
    await page.dispatchEvent(`.key[data-i="${i}"]`, 'pointerdown', { pointerId: 10+i, clientX: b.x+5, clientY: b.y+5 });
    if (during) await during(); await w(ms); const r = await rms();
    await page.dispatchEvent(`.key[data-i="${i}"]`, 'pointerup', { pointerId: 10+i }); return r; };
  // first touch
  let r = await key(0, 300);
  await page.evaluate(() => { const a = AudioSys.ctx.createAnalyser(); a.fftSize = 2048; AudioSys.limiter.connect(a); window.__an = a; });
  r = await key(0, 400);
  const st = await page.evaluate(() => ({ state: AudioSys.ctx.state, session: AudioSys.sessionType, audioEls: document.querySelectorAll('audio,video').length, ms: typeof navigator.mediaSession!=='undefined' ? navigator.mediaSession.playbackState : 'n/a', big: document.getElementById('big').textContent }));
  console.log('after key0', st, 'rms', r.toFixed(4));
  // joystick: press key 5 then push right → Am7
  const jb = await (await page.$('#joy')).boundingBox(); const cx = jb.x + jb.width/2, cy = jb.y + jb.height/2;
  const joyTo = async (dx, dy) => { await page.dispatchEvent('#joy','pointerdown',{pointerId:50,clientX:cx,clientY:cy}); await page.dispatchEvent('#joy','pointermove',{pointerId:50,clientX:cx+dx,clientY:cy+dy}); };
  const joyUp = async () => page.dispatchEvent('#joy','pointerup',{pointerId:50});
  const joyTap = async () => { await page.dispatchEvent('#joy','pointerdown',{pointerId:50,clientX:cx,clientY:cy}); await w(60); await joyUp(); };
  await page.dispatchEvent('.key[data-i="5"]','pointerdown',{pointerId:15}); await w(100);
  await joyTo(60, 0); await w(200);
  console.log('A + right =', await page.textContent('#big'), 'voices', await page.evaluate(()=>R.live.voices.size));
  await joyUp(); await page.dispatchEvent('.key[data-i="5"]','pointerup',{pointerId:15}); await w(100);
  // sweep all sounds for audible output & errors
  const sounds = await page.evaluate(() => SOUNDS.map(s=>s.id));
  for (const s of sounds) { await page.evaluate(id => { S.patch.sound = id; S.patch.env = SOUND_BY_ID[id].env; R.live.applyPatch(S.patch); }, s); const rr = await key(0, 350); process.stdout.write(s+':'+rr.toFixed(3)+' '); }
  console.log();
  await page.evaluate(() => { S.patch.sound='epiano'; S.patch.env='TOUCH'; R.live.applyPatch(S.patch); });
  // modes
  for (const m of ['STRUM','LEAD','DRONE','ARP','REPEAT']) { await page.evaluate(m => setMode(m), m); const rr = await key(3, 700); console.log(m, 'rms', rr.toFixed(3), 'voices', await page.evaluate(()=>R.live.voices.size)); }
  await page.evaluate(() => setMode('PLAY')); await w(300);
  // looper: tap → waiting → set 1 bar → tap → countin → record
  await page.evaluate(() => { S.loopBars = 1; Tr.setBpm(160); });
  await joyTap(); console.log('waiting', await page.evaluate(()=>R.waiting), await page.textContent('#sub'));
  await joyTap(); await w(1600); // count in 4 beats @160 = 1.5s
  console.log('rec active', await page.evaluate(()=>R.rec && R.rec.active));
  await key(0, 500); await key(4, 500);
  await w(700);
  console.log('track1', await page.evaluate(()=>({len:S.loop.len, st:S.tracks[0].state, ev:S.tracks[0].events.length, rec:!!R.rec})));
  await w(300); console.log('looper playback rms', (await rms()).toFixed(3));
  await page.screenshot({ path: 'shot1.png' });
  // second track overdub
  await page.evaluate(()=>{S.patch.sound='strings';S.patch.env='SWELL';R.live.applyPatch(S.patch);});
  await joyTap(); await key(3, 600); await w(1200);
  console.log('track2', await page.evaluate(()=>({st:S.tracks[1].state, ev:S.tracks[1].events.length, patch:S.tracks[1].patch&&S.tracks[1].patch.sound})));
  // sequencer + bounce
  await page.evaluate(()=>setMode('SEQ'));
  for (const i of [0,4,5,3]) await key(i, 80);
  console.log('seq', await page.evaluate(()=>S.seq.steps.map(s=>s&&s.name)));
  await joyTap(); await w(800); console.log('seq playing', await page.evaluate(()=>!!R.seqPlay));
  await page.screenshot({ path: 'shot2.png' });
  await page.evaluate(()=>setMode('DRUMLOOP')); console.log('after bounce tracks', await page.evaluate(()=>S.tracks.map(t=>t.state+':'+t.events.length).join(' ')));
  await key(3, 100); await w(600); console.log('dl playing', await page.evaluate(()=>!!R.dl && R.dlStyle));
  await page.screenshot({ path: 'shot3.png' });
  await page.evaluate(()=>setMode('DRUM')); console.log('after dl bounce', await page.evaluate(()=>S.tracks.map(t=>t.state+':'+t.events.length).join(' ')));
  for (let i=0;i<7;i++) await key(i,60);
  // ear & hiro & mixer
  await page.evaluate(()=>setMode('EAR')); await joyTap(); await w(200); await key(0,50); console.log('ear', await page.textContent('#sub'));
  await page.evaluate(()=>setMode('HIRO')); await joyTap(); await w(2500); await page.screenshot({ path: 'shot4.png' }); console.log('hiro', await page.textContent('#sub'));
  await page.evaluate(()=>setMode('MIXER')); await key(0,50); console.log('mixer mute tr1', await page.evaluate(()=>S.tracks[0].mute));
  // menus
  await page.evaluate(()=>setMode('PLAY'));
  await page.dispatchEvent('#bYellow','pointerdown',{pointerId:70}); await page.dispatchEvent('#bYellow','pointerup',{pointerId:70});
  console.log('menu', await page.evaluate(()=>R.menu), await page.textContent('#mLabel'), await page.textContent('#mVal'));
  await joyTo(0,-60); await w(100); await joyUp(); console.log('after up', await page.textContent('#mVal'));
  await joyTo(60,0); await w(100); await joyUp(); console.log('next item', await page.textContent('#mLabel'), await page.textContent('#mVal'));
  await page.screenshot({ path: 'shot5.png' });
  // combos: hold key 1 + yellow = inversion
  await page.dispatchEvent('#bYellow','pointerdown',{pointerId:70}); await page.dispatchEvent('#bYellow','pointerup',{pointerId:70});
  await page.dispatchEvent('.key[data-i="0"]','pointerdown',{pointerId:10}); await page.dispatchEvent('#bYellow','pointerdown',{pointerId:71}); await page.dispatchEvent('#bYellow','pointerup',{pointerId:71}); await page.dispatchEvent('.key[data-i="0"]','pointerup',{pointerId:10});
  console.log('inv', await page.evaluate(()=>S.buttons[0].inv), 'menu', await page.evaluate(()=>R.menu));
  // preset menu gray+yellow
  await page.dispatchEvent('#bGray','pointerdown',{pointerId:80}); await page.dispatchEvent('#bYellow','pointerdown',{pointerId:81}); await page.dispatchEvent('#bYellow','pointerup',{pointerId:81}); await page.dispatchEvent('#bGray','pointerup',{pointerId:80});
  console.log('preset menu', await page.evaluate(()=>R.menu));
  // landscape
  await page.setViewportSize({ width: 800, height: 380 }); await w(200); await page.screenshot({ path: 'shot6.png' });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
