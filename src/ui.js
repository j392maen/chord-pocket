/* ===== Input & DOM rendering ===== */
function cap(el, id) { try { el.setPointerCapture(id); } catch (e) {} }
const $ = id => document.getElementById(id);
const CHORD_MODES = ['PLAY', 'STRUM', 'LEAD', 'DRONE', 'ARP', 'REPEAT', 'SEQ', 'HIRO'];
const haptic = k => { if (S.haptics !== false) Engine.haptic(k); };

/* ---------- joystick ---------- */
const joy = { id: null, t0: 0, moved: false, longTimer: 0, repTimer: 0, long: false };
function dirFrom(dx, dy) {
  const r = Math.hypot(dx, dy); if (r < 0.36) return 'C';
  const a = Math.atan2(-dy, dx) * 180 / Math.PI;
  return ['R', 'UR', 'U', 'UL', 'L', 'DL', 'D', 'DR'][Math.round(((a + 360) % 360) / 45) % 8];
}
function stopRepeat() { clearTimeout(joy.repTimer); clearInterval(joy.repTimer); }
function autoRepeat(act, first = 420, every = 110) { act(); joy.repTimer = setTimeout(() => { joy.repTimer = setInterval(act, every); }, first); }
function onJoyDir(d) {
  const prev = R.joyDir; R.joyDir = d; stopRepeat();
  if (d === prev) return;
  if (d !== 'C') { joy.moved = true; haptic('selection'); }
  const card = { U: [0, 1], D: [0, -1], L: [-1, 0], R: [1, 0] }[d];
  const heldI = R.order.length ? R.order[R.order.length - 1] : null;
  if (R.menu && heldI == null) { if (card) autoRepeat(() => card[0] ? menuNav(card[0]) : menuVal(card[1])); render(); return; }
  if (R.waiting && card && card[0]) { S.loopBars = clamp(S.loopBars + card[0], 0, 8); save(); render(); return; }
  if (S.mode === 'SEQ' && heldI == null && card) {
    const st = S.seq.steps;
    if (card[0]) autoRepeat(() => { R.seqCursor = (R.seqCursor + card[0] + st.length) % st.length; }, 420, 170);
    else if (card[1] > 0 && st.length < 16) { st.push(null, null, null, null); save(); toast((st.length) + ' STEPS'); }
    else if (card[1] < 0 && st.length > 4) { st.length -= 4; R.seqCursor = Math.min(R.seqCursor, st.length - 1); save(); toast((st.length) + ' STEPS'); }
    render(); return;
  }
  if (S.mode === 'DRUMLOOP' && R.dlHold != null && card && card[1]) { R.dlVar = (R.dlVar + (card[1] > 0 ? 1 : -1) + 8) % 8; R.dlStyle = R.dlHold; R.dlUsed = true; if (!R.dl) dlToggle(R.dlHold); render(); return; }
  if (S.mode === 'MIXER' && R.mixHold != null && card) {
    const t = S.tracks[R.mixHold]; R.mixUsed = true;
    if (card[1]) t.vol = clamp(Math.round((t.vol + card[1] * 0.1) * 10) / 10, 0, 1);
    else if (card[0] > 0) t.solo = !t.solo;
    else if (card[0] < 0) clearTrack(R.mixHold);
    applyMix(); save(); render(); return;
  }
  if (S.mode === 'DRUM' && card && card[0]) { S.drumKit = (S.drumKit + card[0] + 7) % 7; if (R.drums) R.drums.kit = S.drumKit; save(); toast('KIT ' + DRUM_KITS[S.drumKit].name); render(); return; }
  if (S.mode === 'DRUM' || S.mode === 'EAR' || S.mode === 'MIXER' || S.mode === 'DRUMLOOP') { render(); return; }
  if (heldI != null) { rechord(); if (R.onboard === 2 && d !== 'C') advanceCoach(3); render(); return; }
  if (S.joyMode === 'CHROMATIC' && card && card[0]) { S.keyPc = (S.keyPc + card[0] + 12) % 12; toast('KEY ' + NOTE_NAMES[S.keyPc]); save(); }
  render();
}
function onJoyClick() {
  haptic('medium');
  if (R.menu) { menuClick(); return; }
  if (S.mode === 'SEQ') { seqToggle(); return; }
  if (S.mode === 'DRUMLOOP') { if (R.dl) R.dl = null; else dlToggle(R.dlStyle); render(); return; }
  if (S.mode === 'EAR') { earAsk(); return; }
  if (S.mode === 'HIRO') { hiroToggle(); return; }
  if (S.mode === 'MIXER') { const anyPlay = S.tracks.some(t => t.state === 'PLAY'); S.tracks.forEach(t => { if (t.state === 'PLAY' || t.state === 'OFF') t.state = anyPlay ? 'OFF' : 'PLAY'; }); applyMix(); save(); render(); return; }
  if (R.onboard === 3) advanceCoach(0);
  looperClick();
}
function bindJoystick() {
  const el = $('joy'), knob = $('knob');
  const pos = e => { const r = el.getBoundingClientRect(), rad = r.width / 2; return [(e.clientX - r.left - rad) / rad, (e.clientY - r.top - rad) / rad]; };
  el.addEventListener('pointerdown', e => {
    wake(); e.preventDefault(); if (joy.id != null) return;
    joy.id = e.pointerId; cap(el, e.pointerId); joy.t0 = performance.now(); joy.moved = false; joy.long = false;
    knob.classList.add('held');
    joy.longTimer = setTimeout(() => {
      if (!joy.moved && !R.menu && ['PLAY', 'STRUM', 'LEAD', 'DRONE', 'ARP', 'REPEAT', 'DRUM'].includes(S.mode) && S.loop.len) { joy.long = true; haptic('heavy'); clearAll(); }
    }, 900);
    el.classList.add('down');
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    const [dx, dy] = pos(e), r = Math.hypot(dx, dy), k = r > 1 ? 1 / r : 1, travel = el.getBoundingClientRect().width * 0.21;
    knob.style.transform = `translate(${dx * k * travel}px, ${dy * k * travel}px) rotateX(${-dy * k * 14}deg) rotateY(${dx * k * 14}deg)`;
    const d = dirFrom(dx, dy);
    if (d !== 'C') clearTimeout(joy.longTimer);
    if (d !== R.joyDir) onJoyDir(d);
  });
  const end = e => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; clearTimeout(joy.longTimer); el.classList.remove('down'); knob.classList.remove('held');
    knob.style.transform = '';
    const wasMoved = joy.moved, dt = performance.now() - joy.t0;
    if (R.joyDir !== 'C') onJoyDir('C');
    stopRepeat();
    if (!wasMoved && !joy.long && dt < 600) onJoyClick();
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/* ---------- chord keys ---------- */
function bindChordKeys() {
  document.querySelectorAll('.key').forEach(el => {
    const i = +el.dataset.i;
    // Several fingers can land on the same key during fast repeated taps. Treat the key as one
    // switch: it goes down with the first finger and up only when the last finger lifts.
    const fingers = new Set();
    el.addEventListener('pointerdown', e => {
      wake(); e.preventDefault(); cap(el, e.pointerId);
      const first = fingers.size === 0; fingers.add(e.pointerId);
      if (!first) return;
      el.classList.add('on'); keyDown(i);
    });
    const up = e => {
      if (!fingers.delete(e.pointerId) || fingers.size) return;
      el.classList.remove('on'); keyUp(i);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  });
}
function keyDown(i) {
  const md = R.btnDown;
  if (md[0] || md[1] || md[2]) {
    haptic('light');
    if (md[1]) { const s = SOUNDS[[4, 8, 13, 17, 19, 0, 9][i]]; S.patch.sound = s.id; S.patch.env = s.env; S.patch.attackMs = null; S.patch.releaseMs = null; patchChanged(); warmSound(); toast('SOUND ' + s.name); R.comboUsed[1] = true; }
    else if (md[2]) { setMode(MODES[i]); toast('MODE ' + MODES[i]); R.comboUsed[2] = true; }
    else if (md[0]) { S.scaleIdx = i; save(); toast('SCALE ' + SCALES[i].name); R.comboUsed[0] = true; }
    R.keyCombo = R.keyCombo || new Set(); R.keyCombo.add(i); render(); return;
  }
  const m = S.mode;
  if (m === 'DRUM') { haptic('light'); drumHit(i, Engine.now(), 0.9, S.drumKit); R.flash[i] = performance.now(); return; }
  if (m === 'DRUMLOOP') { haptic('light'); R.dlHold = i; R.dlUsed = false; render(); return; }
  if (m === 'EAR') { haptic('light'); earAnswer(i); render(); return; }
  if (m === 'MIXER') { haptic('light'); R.mixHold = i; R.mixUsed = false; if (i < 6) R.mixSel = i; render(); return; }
  if (m === 'HIRO') hiroJudge(i);
  chordPress(i);
  if (R.onboard === 1) advanceCoach(2);
}
function keyUp(i) {
  if (R.keyCombo && R.keyCombo.has(i)) { R.keyCombo.delete(i); return; }
  const m = S.mode;
  if (m === 'DRUMLOOP') { if (R.dlHold === i && !R.dlUsed) dlToggle(i); R.dlHold = null; render(); return; }
  if (m === 'MIXER') { if (R.mixHold === i && !R.mixUsed) { if (i < 6) { const t = S.tracks[i]; t.mute = !t.mute; applyMix(); save(); } else { S.metronome = !S.metronome; toast('CLICK ' + (S.metronome ? 'ON' : 'OFF')); save(); } } R.mixHold = null; render(); return; }
  if (m === 'DRUM' || m === 'EAR') return;
  chordRelease(i);
  if (!R.held.size) R.releasedAt = performance.now();
}

/* ---------- function buttons ---------- */
function bindMenuButtons() {
  const names = ['key', 'sound', 'mode'];
  [$('bGray'), $('bYellow'), $('bRed')].forEach((el, b) => {
    el.addEventListener('pointerdown', e => {
      wake(); e.preventDefault(); cap(el, e.pointerId); el.classList.add('on'); haptic('medium');
      R.btnDown[b] = true; R.comboUsed[b] = false;
      const heldI = R.order.length ? R.order[R.order.length - 1] : null;
      if (heldI != null && CHORD_MODES.includes(S.mode)) {
        const bt = S.buttons[heldI]; R.comboUsed[b] = true;
        if (b === 0) { bt.oct = bt.oct - 1 < -2 ? 0 : bt.oct - 1; toast('KEY ' + (heldI + 1) + ' OCTAVE ' + bt.oct); }
        if (b === 2) { bt.oct = bt.oct + 1 > 1 ? 0 : bt.oct + 1; toast('KEY ' + (heldI + 1) + ' OCTAVE ' + (bt.oct > 0 ? '+' : '') + bt.oct); }
        if (b === 1) {
          if (R.joyDir !== 'C') { const want = mapChord(S.joyMode, R.joyDir, degreeInfo(curScale(), heldI).q); bt.lock = bt.lock === want ? null : want; toast(bt.lock ? 'LOCKED ' + (CHORDS[bt.lock].s || 'MAJ') : 'UNLOCKED'); }
          else if (bt.lock) { bt.lock = null; toast('UNLOCKED'); }
          else { bt.inv = (bt.inv + 1) % 3; toast(['ROOT POSITION', '1ST INVERSION', '2ND INVERSION'][bt.inv]); }
        }
        save(); rechord(); render(); return;
      }
      if (b === 1 && R.btnDown[0] || b === 0 && R.btnDown[1]) { R.comboUsed[0] = R.comboUsed[1] = true; openMenu('preset'); return; }
      if (b === 2 && R.btnDown[0] || b === 0 && R.btnDown[2]) { R.comboUsed[0] = R.comboUsed[2] = true; panic(); return; }
    });
    const up = () => {
      el.classList.remove('on');
      if (!R.btnDown[b]) return; R.btnDown[b] = false;
      if (R.comboUsed[b]) return;
      if (R.menu === names[b]) closeMenu(); else openMenu(names[b]);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
function panic() {
  stopDrone(); R.arp = null; R.rep = null; R.seqPlay = null; R.dl = null;
  if (R.live) R.live.kill(); R.trackCh.forEach(c => c && c.kill());
  R.held.clear(); R.order = []; document.querySelectorAll('.key.on').forEach(k => k.classList.remove('on'));
  toast('ALL NOTES OFF');
}

/* ---------- volume wheel ---------- */
function bindWheel() {
  const el = $('wheel'); let id = null, x0 = 0, y0 = 0, acc = 0;
  el.addEventListener('pointerdown', e => { wake(); e.preventDefault(); id = e.pointerId; cap(el, id); x0 = e.clientX; y0 = e.clientY; acc = 0; el.classList.add('on'); });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    acc += (e.clientX - x0) + (y0 - e.clientY); x0 = e.clientX; y0 = e.clientY;
    const steps = Math.trunc(acc / 5); if (!steps) return; acc -= steps * 5;
    wheelTurn(steps);
    R.wheelPh = ((R.wheelPh || 0) + steps * 2.5); $('ridges').style.backgroundPositionX = R.wheelPh + 'px';
    if (Math.abs(steps) > 0) haptic('selection');
  });
  const up = e => { if (e.pointerId === id) { id = null; el.classList.remove('on'); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function wheelTurn(steps) {
  const md = R.btnDown;
  const expStep = (v, lo, hi) => clamp(Math.round(v * Math.pow(1.08, steps)) || 1, lo, hi);
  if (md[0]) { const cur = S.patch.attackMs != null ? S.patch.attackMs : ADSR_PRESETS[S.patch.env].a * 1000; S.patch.attackMs = expStep(Math.max(1, cur), 1, 2000); R.comboUsed[0] = true; patchChanged(); toast('ATTACK ' + S.patch.attackMs + ' MS'); return; }
  if (md[1]) { const cur = S.patch.releaseMs != null ? S.patch.releaseMs : ADSR_PRESETS[S.patch.env].r * 1000; S.patch.releaseMs = expStep(Math.max(1, cur), 1, 5000); R.comboUsed[1] = true; patchChanged(); toast('RELEASE ' + S.patch.releaseMs + ' MS'); return; }
  if (md[2]) { S.patch.fx.cutoff = expStep(S.patch.fx.cutoff, 20, 20000); R.comboUsed[2] = true; patchChanged(); toast('CUTOFF ' + fmtHz(S.patch.fx.cutoff).toUpperCase()); return; }
  S.volume = clamp(Math.round((S.volume + steps * 0.02) * 100) / 100, 0, 1); Engine.setVolume(S.volume); save();
  toast('VOLUME ' + Math.round(S.volume * 100)); render();
}

/* ---------- keyboard (desktop) ---------- */
function bindKeyboard() {
  const km = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 }, dirKeys = new Set();
  const dirFromKeys = () => { const u = dirKeys.has('ArrowUp') || dirKeys.has('w'), d = dirKeys.has('ArrowDown') || dirKeys.has('s'), l = dirKeys.has('ArrowLeft') || dirKeys.has('a'), r = dirKeys.has('ArrowRight') || dirKeys.has('d'); return ((u ? 'U' : d ? 'D' : '') + (l ? 'L' : r ? 'R' : '')) || 'C'; };
  const fb = { q: 'bGray', e: 'bYellow', r: 'bRed' };
  addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey) return;
    if (!$('help').hidden) { if (e.key === 'Escape') closeHelp(); return; }
    wake();
    if (e.key in km) { document.querySelector('.key[data-i="' + km[e.key] + '"]').classList.add('on'); keyDown(km[e.key]); }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) { e.preventDefault(); dirKeys.add(e.key); onJoyDir(dirFromKeys()); }
    else if (e.key === ' ') { e.preventDefault(); onJoyClick(); }
    else if (fb[e.key]) $(fb[e.key]).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 900 }));
  });
  addEventListener('keyup', e => {
    if (e.key in km) { document.querySelector('.key[data-i="' + km[e.key] + '"]').classList.remove('on'); keyUp(km[e.key]); }
    else if (dirKeys.has(e.key)) { dirKeys.delete(e.key); onJoyDir(dirFromKeys()); }
    else if (fb[e.key]) $(fb[e.key]).dispatchEvent(new PointerEvent('pointerup', { pointerId: 900 }));
  });
}

/* ---------- screen touch zones ---------- */
function bindScreen() {
  const z = { zPrev: () => menuNav(-1), zNext: () => menuNav(1), zDown: () => menuVal(-1), zUp: () => menuVal(1), zAct: () => { haptic('medium'); menuClick(); }, zTitle: () => closeMenu() };
  for (const id in z) $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (R.menu) z[id](); render(); });
  $('scrTouch').addEventListener('pointerdown', e => { wake(); if (R.onboard && !R.menu && !R.boot) { advanceCoach(0); } });
  $('helpBtn').addEventListener('click', openHelp);
  $('helpClose').addEventListener('click', closeHelp);
  document.querySelectorAll('.htab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.htab').forEach(x => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
    document.querySelectorAll('.hpanel').forEach(p => { p.hidden = p.id !== t.dataset.p; });
    $('helpBody').scrollTop = 0;
  }));
  $('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) loadUserSample(f); e.target.value = ''; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  ['touchend', 'click', 'pointerup'].forEach(ev => document.addEventListener(ev, () => Engine.resume && Engine.resume(), { passive: true }));
  addEventListener('resize', () => { OLED.resize(); layoutRing(); });
  if (screen.orientation) screen.orientation.addEventListener('change', () => setTimeout(() => { OLED.resize(); layoutRing(); }, 120));
}
function openHelp() { $('help').hidden = false; requestAnimationFrame(() => $('help').classList.add('open')); }
function closeHelp() { $('help').classList.remove('open'); setTimeout(() => { $('help').hidden = true; }, 260); }

/* ---------- boot / onboarding ---------- */
function wake() {
  const first = !R.started;
  startAudio();
  if (first) {
    haptic('medium');
    const wait = Math.max(0, 1500 - (performance.now() - R.boot.t0));
    setTimeout(() => { R.boot = null; if (!S.onboarded) R.onboard = 1; render(); }, wait);
  }
}
function onStarted() { render(); }
function advanceCoach(n) {
  if (n === 0) { R.onboard = 0; S.onboarded = true; save(); }
  else R.onboard = n;
  render();
}

/* ---------- DOM rendering ---------- */
const GENERIC_DIR = { U: 'M⇄m' };
function ringLabels() {
  const heldI = R.order.length ? R.order[R.order.length - 1] : null, m = S.mode, L = {};
  if (R.menu) return { U: 'VALUE +', D: 'VALUE −', L: 'ITEM', R: 'ITEM', C: 'TAP ' + (menuItems()[R.menuIdx[R.menu]].click ? 'RUN' : 'RANDOM') };
  if (R.waiting) return { L: '− BAR', R: '+ BAR', C: 'TAP REC' };
  if (m === 'SEQ' && heldI == null) return { L: 'PREV', R: 'NEXT', U: '+4 STEPS', D: '−4 STEPS', C: R.seqPlay ? 'TAP STOP' : 'TAP PLAY' };
  if (m === 'MIXER') return { U: 'VOL +', D: 'VOL −', R: 'SOLO', L: 'CLEAR', C: S.tracks.some(t => t.state === 'PLAY') ? 'TAP STOP ALL' : 'TAP PLAY ALL', dim: R.mixHold == null };
  if (m === 'DRUMLOOP') return { U: 'VAR +', D: 'VAR −', C: R.dl ? 'TAP STOP' : 'TAP PLAY', dim: R.dlHold == null };
  if (m === 'EAR') return { C: 'TAP QUIZ' };
  if (m === 'HIRO') return { C: 'TAP START' };
  if (m === 'DRUM') return { L: 'KIT −', R: 'KIT +', C: S.loop.len ? 'TAP REC' : 'TAP LOOP' };
  for (const d of DIRS) {
    if (heldI != null) { const b = S.buttons[heldI]; L[d] = b.lock ? '' : chordFor(heldI, d, { slashDeg: R.held.get(heldI).slashDeg }).name; }
    else L[d] = GENERIC_DIR[d] && S.joyMode !== 'CHROMATIC' ? GENERIC_DIR[d] : (CHORDS[mapChord(S.joyMode, d, 'maj')].s || 'M');
  }
  if (heldI == null && S.joyMode === 'CHROMATIC') { L.L = 'KEY −'; L.R = 'KEY +'; }
  L.C = R.rec && R.rec.active ? 'TAP STOP' : S.loop.len ? 'TAP REC' : 'TAP LOOP';
  if (heldI != null && S.buttons[heldI].lock) L.U = 'LOCKED';
  return L;
}
function layoutRing() {
  const ring = $('ring'); if (!ring) return;
  const r = ring.getBoundingClientRect().width / 2, jr = $('joy').getBoundingClientRect().width / 2;
  ring.querySelectorAll('.rl').forEach(el => {
    const d = el.dataset.d, deg = { R: 0, UR: 45, U: 90, UL: 135, L: 180, DL: 225, D: 270, DR: 315 }[d], a = deg * Math.PI / 180;
    const rr = jr + 10, x = r + Math.cos(a) * rr, y = r - Math.sin(a) * rr;
    const ax = Math.abs(Math.cos(a)) < 0.2 ? '-50%' : Math.cos(a) > 0 ? '0%' : '-100%';
    const ay = Math.abs(Math.sin(a)) < 0.2 ? '-50%' : Math.sin(a) > 0 ? '-100%' : '0%';
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.setProperty('--ax', ax); el.style.setProperty('--ay', ay);
  });
}
function keyLabels() {
  document.querySelectorAll('.key').forEach(el => {
    const i = +el.dataset.i, m = S.mode;
    let top = '', main = '', sub = '';
    if (m === 'DRUM') { main = ['KICK', 'SNARE', 'CLAP', 'HAT', 'TOM', 'BELL', 'CYMBAL'][i]; top = String(i + 1); }
    else if (m === 'DRUMLOOP') { main = DRUM_STYLES[i]; top = String(i + 1); sub = R.dl && R.dlStyle === i ? DRUM_VARS[R.dlVar] : ''; }
    else if (m === 'MIXER') { if (i < 6) { const t = S.tracks[i]; main = 'TRACK ' + (i + 1); sub = t.state === 'EMPTY' ? 'EMPTY' : (t.mute ? 'MUTE' : t.solo ? 'SOLO' : 'VOL ' + Math.round(t.vol * 10)); } else { main = 'CLICK'; sub = S.metronome ? 'ON' : 'OFF'; } top = String(i + 1); }
    else {
      const di = degreeInfo(curScale(), i), b = S.buttons[i];
      const ch = buildChord({ keyPc: S.keyPc, scale: curScale(), deg: i, dir: 'C', joyMode: S.joyMode, lockedType: b.lock, btnOct: b.oct, globalOct: S.globalOct, inversion: b.inv });
      top = romanFor(i, di.q); main = ch.name;
      const flags = []; if (b.oct) flags.push((b.oct > 0 ? '+' : '') + b.oct + ' OCT'); if (b.inv) flags.push('INV ' + b.inv); if (b.lock) flags.push('LOCK');
      sub = flags.join(' · ');
    }
    el.querySelector('.k-top').textContent = top;
    const km = el.querySelector('.k-main'); km.textContent = main; km.dataset.len = (m === 'DRUMLOOP' || m === 'DRUM') ? 'u' : main.length > 6 ? 'xl' : main.length > 4 ? 'l' : '';
    el.querySelector('.k-sub').textContent = sub;
    el.setAttribute('aria-label', (top ? top + ' ' : '') + main);
    km.style.fontSize = '';
    for (let k = 0; k < 6 && km.scrollWidth > km.clientWidth + 0.5; k++) km.style.fontSize = (parseFloat(getComputedStyle(km).fontSize) * 0.9) + 'px';
  });
}
function render() {
  if (!$('dev')) return;
  keyLabels();
  const L = ringLabels();
  document.querySelectorAll('.rl').forEach(el => { const t = L[el.dataset.d] || ''; if (el.textContent !== t) el.textContent = t; el.classList.toggle('lit', el.dataset.d === R.joyDir && !!t); el.classList.toggle('dim', !!L.dim); });
  $('joyHint').textContent = L.C || '';
  $('sideTip').textContent = sideTip();
  ['key', 'sound', 'mode'].forEach((n, i) => $(['bGray', 'bYellow', 'bRed'][i]).classList.toggle('open', R.menu === n || (R.menu === 'preset' && i < 2)));
  $('volLevel').style.transform = `scaleX(${S.volume})`;
  $('dev').dataset.coach = R.onboard === 1 ? 'keys' : R.onboard === 2 ? 'joy' : R.onboard === 3 ? 'tap' : '';
  $('scrTouch').classList.toggle('menu', !!R.menu);
  document.body.classList.toggle('rec', !!(R.rec && R.rec.active));
  $('ledRec').classList.toggle('on', !!(R.rec && (R.rec.active || R.countIn)));
  $('ledLoop').classList.toggle('on', S.tracks.some(t => t.state === 'PLAY'));
}
function sideTip() {
  if (R.menu) return '←→ で項目、↑↓ で値を変更。画面を直接タップしても操作できます。';
  if (R.waiting) return '←→ で小節数。FREEはタップで止めた長さになります。';
  const m = S.mode;
  if (m === 'SEQ') return 'キーでステップに和音を入れ、タップで再生。↑ で4ステップ追加。';
  if (m === 'DRUMLOOP') return 'キーでスタイル。キーを押しながら ↑↓ でバリエーション。';
  if (m === 'DRUM') return 'キーでドラムを叩く。←→ でキット、タップでルーパー録音。';
  if (m === 'HIRO') return '光ったキーを小節の頭で押す。';
  if (m === 'EAR') return 'タップで出題。聞こえた和音のキーで答える。';
  if (m === 'MIXER') return 'キーでミュート。キーを押しながら倒すと音量・ソロ・消去。';
  return 'キーを押したまま倒すと、周りの和音に変わります。長押しでループを全消去。';
}
function keyLights() {
  const gd = $('grille').children; for (let i = 0; i < 7; i++) gd[i].classList.toggle('on', R.held.has(i) || (S.mode === 'DRONE' && R.drone && R.drone.i === i));
  const lit = new Set(), target = new Set();
  if (S.mode === 'SEQ' && R.seqPlay) { const st = S.seq.steps, k = Math.floor((Tr.beatNow() - R.seqPlay.sb) / SEQ_STEPLEN[S.seqStepLen]); if (k >= 0) { const s = st[((k % st.length) + st.length) % st.length]; if (s) lit.add(s.deg); } }
  if (S.mode === 'DRUMLOOP' && R.dl) lit.add(R.dlStyle);
  if (S.mode === 'HIRO' && R.hiro && R.hiro.running) { const b = Tr.beatNow(), j = Math.round((b - R.hiro.start) / 4 + 0.35); if (j >= 0 && j < 16 && !R.hiro.judged[j]) target.add(R.hiro.prog[j]); }
  if (S.mode === 'DRONE' && R.drone) lit.add(R.drone.i);
  document.querySelectorAll('.key').forEach(el => { const i = +el.dataset.i; el.classList.toggle('lit', lit.has(i)); el.classList.toggle('target', target.has(i)); });
}
let lastFrame = 0, lastLights = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const busy = R.boot || R.started;
  if (!busy && t - lastFrame < 60) return;
  lastFrame = t;
  drawScreen();
  if (t - lastLights > 45) { lastLights = t; keyLights(); if (R.started) $('dev').classList.toggle('beat', ((Tr.beatNow() % 1) + 1) % 1 < 0.14); }
}

function makeGrain() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d'), d = x.createImageData(180, 180);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 10; }
    x.putImageData(d, 0, 0); document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
  } catch (e) {}
}
function init() {
  load(); applyBody(); makeGrain();
  $('audioNote').innerHTML = Engine.isNative
    ? '<b>裏の音楽は止まりません。</b>アプリ版は消音スイッチがONでも鳴ります。'
    : '<b>裏の音楽は止まりません。</b>iPhoneのブラウザでは、消音スイッチがONだと音が出ません。KEY › AUDIO を SOLO にすると消音スイッチを無視して鳴りますが、ほかのアプリの再生は止まります。';
  R.boot = { t0: performance.now() };
  OLED.init($('oled'), $('oledGlow'), $('oledGrid'));
  bindChordKeys(); bindJoystick(); bindMenuButtons(); bindWheel(); bindKeyboard(); bindScreen();
  layoutRing(); render(); requestAnimationFrame(frame);
  document.documentElement.classList.add('ready');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
