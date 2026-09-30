/* ===== Screen composition on the dot-matrix OLED ===== */
const AMBER = 1, RED = 2, MINT = 3;
const SCALE_SHORT = { major: 'MAJOR', minor: 'MINOR', harm: 'HARM MIN', melo: 'MELO MIN', majpent: 'MAJ PENTA', minpent: 'MIN PENTA', blues: 'BLUES', dorian: 'DORIAN', mixo: 'MIXOLYD', lydian: 'LYDIAN' };
const MODE_SHORT = { PLAY: 'PLAY', STRUM: 'STRUM', LEAD: 'LEAD', DRONE: 'DRONE', ARP: 'ARP', REPEAT: 'REPEAT', SEQ: 'SEQ', DRUM: 'DRUM', DRUMLOOP: 'LOOPS', HIRO: 'HIRO', EAR: 'EAR', MIXER: 'MIXER' };
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const blink = (per = 600) => (performance.now() % per) < per / 2;

function soundingNotes(now) {
  const m = new Map();
  const add = (ch, b) => { if (!ch) return; for (const v of ch.voices) { if (v.start <= now + 0.005 && (v.offAt == null || now < v.offAt)) m.set(Math.round(v.midi), Math.max(m.get(Math.round(v.midi)) || 0, b)); } };
  add(R.live, 1); R.trackCh.forEach(c => add(c, 0.5));
  return m;
}

function drawStatus(now) {
  const W = OLED.W, s = curScale();
  OLED.text(NOTE_NAMES[S.keyPc] + ' ' + SCALE_SHORT[s.id], 2, 1, { b: 0.95 });
  const recOn = R.rec && R.rec.active;
  if (recOn) { if (blink(700)) OLED.text('● REC', W - 3, 1, { align: 'r', c: RED }); }
  else {
    const bpmW = OLED.text('♩' + S.bpm, W - 20, 1, { align: 'r', b: 0.9 });
    const beat = R.started ? Math.floor(((Tr.beatNow() % 4) + 4) % 4) : -1;
    for (let i = 0; i < 4; i++) OLED.rect(W - 17 + i * 4, 2, 3, 3, i === beat ? 1 : 0.18, i === beat ? AMBER : 0);
  }
  OLED.text(MODE_SHORT[S.mode], Math.round(W * 0.52), 1, { align: 'c', c: AMBER });
  // baseline doubles as the loop playhead
  OLED.hline(0, 8, W, 0.16, 0, 2);
  if (S.loop.len && R.started) {
    const pos = (((Tr.beatNow() - R.L0) % S.loop.len) + S.loop.len) % S.loop.len / S.loop.len;
    OLED.hline(0, 8, Math.round(W * pos), recOn ? 0.9 : 0.55, recOn ? RED : AMBER);
  }
}

function drawKeyboard(y, notes, hh) {
  const W = OLED.W, lo = 36, hi = 84, BL = [1, 3, 6, 8, 10];
  let whites = 0; for (let m = lo; m <= hi; m++) if (!BL.includes(m % 12)) whites++;
  const kw = Math.max(3, Math.min(6, Math.floor((W - 4) / whites))), x0 = Math.round((W - kw * whites) / 2), h = hh || 11, bh = Math.round(h * 0.58);
  const kbW = kw * whites;
  // frame: top line, bottom line
  OLED.hline(x0, y + h, kbW + 1, 0.3);
  let wi = 0; const blacks = [];
  for (let m = lo; m <= hi; m++) {
    if (BL.includes(m % 12)) { blacks.push([m, x0 + wi * kw]); continue; }
    const x = x0 + wi * kw, b = notes.get(m);
    for (let j = 0; j <= h; j++) OLED.px(x, y + j, 0.3);             // key separator
    if (b) OLED.rect(x + 1, y + bh + 1, kw - 1, h - bh - 1, b, b > 0.9 ? 0 : MINT), OLED.rect(x + 1, y, kw - 1, h, b * 0.8, b > 0.9 ? 0 : MINT);
    if (m % 12 === 0) OLED.px(x + 1 + ((kw - 1) >> 1), y + h + 2, m === 60 ? 0.9 : 0.35, m === 60 ? AMBER : 0);
    wi++;
  }
  for (let j = 0; j <= h; j++) OLED.px(x0 + kbW, y + j, 0.3);
  for (const [m, x] of blacks) {
    const b = notes.get(m), bw = Math.max(2, kw - 2), bx = x - (bw >> 1);
    OLED.erase(bx - 1, y, bw + 2, bh + 1);
    if (b) OLED.rect(bx, y, bw, bh, b, b > 0.9 ? AMBER : MINT);
    else OLED.rect(bx, y, bw, bh, 0.42);
  }
}
function drawScope(x, y, w, h) {
  OLED.frame(x, y, w, h, 0.12);
  const d = Engine.scope ? Engine.scope() : null; if (!d || !d.length) return;
  let start = 0; for (let i = 1; i < d.length / 2; i++) if (d[i - 1] < 0 && d[i] >= 0) { start = i; break; }
  let peak = 0.02; for (let i = start; i < start + 256 && i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = Math.min(1 / peak, 6) * 0.9, sb = peak < 0.015 ? (h > 40 ? 0.12 : 0.3) : 0.85;
  let py = null;
  for (let i = 0; i < w - 2; i++) {
    const idx = start + Math.floor(i * 256 / (w - 2)); const v = d[idx] || 0;
    const yy = Math.round(y + h / 2 - v * g * (h / 2 - 2));
    if (py != null) OLED.line(x + i, py, x + 1 + i, yy, sb, MINT); py = yy;
  }
}

function loopShape(i, x, y, st) {
  const b = st === 'play' ? 1 : st === 'rec' ? 1 : st === 'off' ? 0.5 : 0.28, c = st === 'rec' ? RED : 0, fill = st === 'play' || st === 'rec';
  if (i < 2) OLED.disk(x + 2, y + 2, 2, b, c, fill);
  else if (i < 4) { if (fill) OLED.rect(x, y, 5, 5, b, c); else OLED.frame(x, y, 5, 5, b, c); }
  else { for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) { const inside = Math.abs(k - 2) <= r / 2; const edge = Math.abs(k - 2) >= r / 2 - 0.6 || r === 4; if (inside && (fill || edge)) OLED.px(x + k, y + r, b, c); } }
}
function drawLoops(y) {
  // six numbered track boxes: filled = playing, outline = recorded but muted/stopped, dim = empty, red = recording
  y -= 1;
  S.tracks.forEach((t, i) => {
    const rec = R.rec && R.rec.track === i && (R.rec.active || R.countIn);
    const x = 2 + i * 10, n = String(i + 1);
    if (rec) { if (blink(500)) { OLED.rect(x, y, 8, 7, 1, RED); OLED.text(n, x + 3, y + 1, { b: -1 }); } else { OLED.frame(x, y, 8, 7, 0.9, RED); OLED.text(n, x + 3, y + 1, { c: RED }); } }
    else if (t.state === 'PLAY' && !t.mute) { OLED.frame(x, y, 8, 7, 1, AMBER); OLED.text(n, x + 3, y + 1, { c: AMBER }); OLED.hline(x + 1, y + 8, 6, 1, AMBER); }
    else if (t.state !== 'EMPTY') { OLED.frame(x, y, 8, 7, 0.6, AMBER); OLED.text(n, x + 3, y + 1, { b: 0.6, c: AMBER }); }
    else { OLED.frame(x, y, 8, 7, 0.4); }
  });
}

function drawToast() {
  if (!R.toast || performance.now() > R.toast.until) return;
  const W = OLED.W, H = OLED.H, y = H - 32;
  OLED.erase(0, y - 1, W, 12);
  OLED.rect(0, y, W, 10, 0.92, AMBER);
  if (OLED.isAscii(R.toast.msg)) OLED.text(R.toast.msg, W / 2, y + 3, { align: 'c', b: -1 });
  else { OLED.erase(0, y - 5, W, 20); OLED.rect(0, y - 4, W, 18, 0.92, AMBER); OLED.jp(R.toast.msg, W / 2, y + 1, { align: 'c', b: -1 }); }
}

function fitScale(str, maxW, scales) { for (const s of scales) if (OLED.textW(str, s) <= maxW) return s; return scales[scales.length - 1]; }

function drawHome(now) {
  const W = OLED.W, H = OLED.H, ch = R.lastChord, active = R.held.size || R.drone, compact = H < 106;
  const tall = H >= 135;
  const chipY = ch && !compact && !tall ? 13 + 5 * fitScale(ch.name, W - Math.min(64, Math.round(W * 0.3)) - 10, [6, 5, 4, 3]) + 17 : H - 40;
  const scopeW = tall ? 0 : Math.min(64, Math.round(W * 0.3)), scopeH = compact ? 20 : 30;
  if (ch) {
    const fade = active ? 1 : Math.max(0.72, 1 - (performance.now() - (R.releasedAt || 0)) / 700);
    const s = fitScale(ch.name, W - scopeW - 10, compact ? [4, 3, 2] : tall ? [8, 7, 6, 5, 4] : [6, 5, 4, 3]);
    const rv = Math.min(1, (performance.now() - (R.chordT0 || 0)) / 110);
    OLED.text(ch.name, 3, 13, { s, b: fade, mask: rv < 1 ? (x, y) => hash2(x, y) < rv : null });
    const ry = 13 + 5 * s + (compact ? 3 : 4), rs = compact ? 1 : 2;
    const rw = OLED.text(ch.roman, 3, ry, { s: rs, c: AMBER, b: Math.max(0.5, fade) });
    const snd = SOUND_BY_ID[S.patch.sound];
    OLED.text(snd.name, 3 + rw + 6, ry + (rs - 1) * 3, { b: 0.55 });
    const tones = [...new Set(allNotes(ch).map(n => NOTE_NAMES[((n % 12) + 12) % 12]))].join(' ');
    OLED.text(tones, W - 3, tall ? 13 : 13 + scopeH + 3, { align: 'r', s: tall ? 2 : 1, b: 0.75 * fade + 0.1 });
  } else {
    OLED.text(NOTE_NAMES[S.keyPc] + (curScale().id === 'major' ? '' : 'm'), 3, 13, { s: compact ? 4 : 6, b: 0.4 });
    OLED.text(SOUND_BY_ID[S.patch.sound].name, 3, 13 + (compact ? 20 : 30) + 4, { b: 0.55 });
  }
  if (tall) {
    const cs = ch ? fitScale(ch.name, W - scopeW - 10, [8, 7, 6, 5, 4]) : 6;
    const sy = 13 + 5 * cs + 18, sh = Math.min(Math.round(H * 0.4), (H - 50) - sy - 2);
    if (sh >= 16) drawScope(3, sy, W - 6, sh); else drawScope(W - scopeW - 2, 13, scopeW, scopeH);
  } else drawScope(W - scopeW - 2, 13, scopeW, scopeH);
  const modeInfo = modeLine();
  if (modeInfo) OLED.text(modeInfo, W - 3, tall ? 28 : 13 + scopeH + (ch ? 11 : 3), { align: 'r', b: 0.45, c: AMBER });
  if (R.hist && R.hist.length && !R.onboard && ch) {
    // progression history as chips just above the keyboard
    const y = compact ? H - 36 : chipY, hs = R.hist.slice(-(tall ? 8 : 6));
    let x = 3;
    if (!compact) { OLED.text('PROG', x, y + 2, { b: 0.45 }); x += 21; }
    hs.forEach((h, i) => {
      const cs = tall ? 2 : 1, last = i === hs.length - 1, w = OLED.textW(h.roman, cs) + 4 + 2 * cs, ch2 = 5 * cs + 4;
      if (x + w > W - 2) return;
      if (last) { OLED.frame(x, y - (cs - 1) * 5, w, ch2, 1, AMBER); OLED.text(h.roman, x + 2 + cs, y + 2 - (cs - 1) * 5, { s: cs, c: AMBER }); }
      else { OLED.frame(x, y - (cs - 1) * 5, w, ch2, 0.3); OLED.text(h.roman, x + 2 + cs, y + 2 - (cs - 1) * 5, { s: cs, b: 0.45 + i * 0.07 }); }
      x += w + 2;
    });
    // ghost slots keep the band's rhythm while the history is short
    for (let k = hs.length; k < 6 && !tall; k++) { const w = 12; if (x + w > W - 2) break; OLED.frame(x, y, w, 9, 0.1); x += w + 2; }
  }
  if (!(compact && R.onboard)) {
    const ky = compact || tall ? H - 25 : Math.min(H - 25, chipY + 14), kh = compact || tall ? 11 : Math.max(11, Math.min(26, H - 12 - ky));
    drawKeyboard(ky, soundingNotes(now), kh);
  }
  drawLoops(H - 7);
  const hint = homeHint();
  if (hint) OLED.text(hint, W - 3, H - 7, { align: 'r', b: 0.6 });
  if (R.onboard && !(R.hist && R.hist.length && !compact && false)) drawCoach();
}
function modeLine() {
  const m = S.mode;
  if (m === 'ARP') return S.arpPattern + ' ' + RATE_LABEL(S.arpRate).replace('SWING ', 'SW');
  if (m === 'STRUM') return 'STRUM ' + S.strum;
  if (m === 'REPEAT') return 'RPT ' + RATE_LABEL(S.repeatRate).replace('SWING ', 'SW');
  if (m === 'DRONE') return R.drone ? 'DRONE ON' : 'DRONE';
  if (m === 'LEAD') return 'MONO GLIDE';
  if (S.joyMode !== 'DEFAULT') return S.joyMode;
  return '';
}
function homeHint() {
  if (R.rec && R.rec.active) { const b = Tr.beatNow(); return R.rec.stopAt ? 'REC ' + Math.max(0, R.rec.stopAt - b).toFixed(1) : 'REC ' + (b - R.rec.start).toFixed(1); }
  if (!S.loop.len) return 'STICK ' + ({ DEFAULT: 'STD', EXTENDED: 'EXT', CHROMATIC: 'CHR' })[S.joyMode] + '  VOL ' + Math.round(S.volume * 100);
  const n = S.tracks.filter(t => t.state !== 'EMPTY').length;
  return n + '/6 LOOP ' + (S.loop.len / 4).toFixed(S.loop.len % 4 ? 1 : 0) + ' BAR';
}
function drawCoach() {
  const W = OLED.W, H = OLED.H, y = H < 106 ? H - 22 : H - 44;
  const msg = ['', 'キーをおして和音をならす', 'おしたままスティックをたおす', 'スティックをタップで録音'][R.onboard];
  OLED.erase(0, y - 5, W, 19);
  OLED.frame(1, y - 4, W - 2, 17, 0.6, AMBER);
  OLED.text(R.onboard + '/3', 5, y + 2, { c: AMBER });
  OLED.jp(msg, 22, y + 1, { b: blink(1200) ? 1 : 0.8 });
  OLED.text('SKIP ▶', W - 5, y + 2, { align: 'r', b: 0.85 });
}

function drawMenu() {
  const W = OLED.W, H = OLED.H, items = menuItems(), idx = R.menuIdx[R.menu], it = items[idx], compact = H < 106;
  OLED.rect(0, 0, W, 9, 0.95, AMBER);
  OLED.text(MENU_TITLE_EN[R.menu], 3, 2, { b: -1 });
  OLED.text((idx + 1) + '/' + items.length, W - 3, 2, { align: 'r', b: -1 });
  // label row
  OLED.text('◀', 3, 14, { s: 2, b: 0.8 }); OLED.text('▶', W - 3, 14, { s: 2, b: 0.8, align: 'r' });
  OLED.text(it.label, W / 2, 14, { s: 2, align: 'c' });
  if (it.jp && !compact) OLED.jp(it.jp, W / 2, 29, { align: 'c', b: 0.75 });
  // value
  const v = String(it.get());
  const vy = compact ? 28 : 46;
  if (OLED.isAscii(v)) { const s = fitScale(v, W - 34, [3, 2, 1]); OLED.text(v, W / 2, vy + (3 - s) * 2, { s, align: 'c', c: it.click ? AMBER : 0 }); }
  else OLED.jp(v, W / 2, vy + 2, { align: 'c', c: it.click ? AMBER : 0 });
  if (it.inc) { OLED.text('▼', 3, vy + 2, { s: 2, b: 0.8 }); OLED.text('▲', W - 3, vy + 2, { s: 2, b: 0.8, align: 'r' }); }
  // bar for 0..10 values
  if (/^\d+$/.test(v) && +v <= 10 && it.bar !== false) {
    const segW = Math.floor((W - 60) / 10);
    for (let i = 0; i < 10; i++) OLED.rect(30 + i * segW, vy + 19, segW - 2, 3, i < +v ? 0.9 : 0.15, i < +v ? AMBER : 0);
  }
  const subTxt = it.sub ? it.sub() : (compact ? it.jp : '');
  if (subTxt) OLED.jp(subTxt, W / 2, H - (compact ? 20 : 24), { align: 'c', b: 0.8 });
  OLED.text(it.click ? 'TAP STICK = RUN' : '←→ ITEM  ↑↓ VALUE  TAP = RANDOM', W / 2, H - 6, { align: 'c', b: 0.62 });
}
const MENU_TITLE_EN = { key: 'KEY · SETTINGS', sound: 'SOUND · EFFECTS', mode: 'MODE · TEMPO', preset: 'PRESETS' };

function drawSeq(now) {
  const W = OLED.W, H = OLED.H, st = S.seq.steps, L = SEQ_STEPLEN[S.seqStepLen];
  const cw = Math.floor((W - 2) / 8), chh = 13;
  const playK = R.seqPlay ? Math.floor((Tr.beatNow() - R.seqPlay.sb) / L) : -1;
  const playIdx = playK >= 0 ? ((playK % st.length) + st.length) % st.length : -1;
  for (let i = 0; i < 16; i++) {
    const x = 1 + (i % 8) * cw, y = 12 + Math.floor(i / 8) * (chh + 2);
    if (i >= st.length) { OLED.px(x + cw / 2, y + chh / 2, 0.15); continue; }
    const s = st[i];
    if (i === playIdx) OLED.rect(x, y, cw - 2, chh, 0.95, AMBER);
    else OLED.frame(x, y, cw - 2, chh, i === R.seqCursor ? 1 : 0.2, i === R.seqCursor ? AMBER : 0);
    const label = s ? s.roman : '·';
    OLED.text(label, x + (cw - 2) / 2, y + 4, { align: 'c', b: i === playIdx ? -1 : (s ? 0.95 : 0.3) });
  }
  const cur = st[R.seqCursor];
  const y2 = 12 + 2 * (chh + 2) + 3;
  const cs = fitScale(cur ? cur.name : '---', W - 70, H < 106 ? [3, 2] : [5, 4, 3]);
  OLED.text(cur ? cur.name : '---', 3, y2, { s: cs, b: cur ? 1 : 0.3 });
  OLED.text((R.seqPlay ? '▶ PLAY' : '■ STOP') + '  ' + (R.seqCursor + 1) + '/' + st.length, W - 3, y2, { align: 'r', c: R.seqPlay ? AMBER : 0 });
  OLED.text('STEP ' + (L === 4 ? '1 BAR' : L + ' BEAT'), W - 3, y2 + 8, { align: 'r', b: 0.45 });
  if (H >= 106) drawKeyboard(H - 25, soundingNotes(now));
  OLED.text('←→ MOVE  ↑ ADD 4  TAP PLAY', W / 2, H - 7, { align: 'c', b: 0.62 });
}
function drawDrumLoop() {
  const W = OLED.W, H = OLED.H, pat = dlPattern(R.dlStyle, R.dlVar);
  OLED.text(DRUM_STYLES[R.dlStyle], 3, 13, { s: 3, b: R.dl ? 1 : 0.5 });
  OLED.text(DRUM_VARS[R.dlVar], 3, 32, { c: AMBER });
  OLED.text('KIT ' + DRUM_KITS[S.drumKit].name, W - 3, 13, { align: 'r', b: 0.55 });
  OLED.text(R.dl ? '▶ PLAYING' : '■ STOPPED', W - 3, 21, { align: 'r', c: R.dl ? AMBER : 0, b: R.dl ? 1 : 0.5 });
  const lanes = [['K', p => p.K], ['S', p => (p.S || '') + ''], ['H', p => p.H], ['X', p => { let o = ''; for (let i = 0; i < 16; i++) o += (p.O[i] === 'x' || p.R[i] === 'x' || p.C[i] === 'x' || p.T[i] === 'x' || p.G[i] === 'x') ? 'x' : '.'; return o; }]];
  const x0 = 10, cw = Math.floor((W - x0 - 2) / 16), y0 = 42;
  const k = R.dl ? ((Math.floor((Tr.beatNow() - R.dl.sb) / 0.25) % 16) + 16) % 16 : -1;
  lanes.forEach(([lab, f], li) => {
    const row = f(pat) || '', y = y0 + li * 7;
    OLED.text(lab, 2, y, { b: 0.5 });
    for (let i = 0; i < 16; i++) {
      const on = row[i] === 'x', x = x0 + i * cw;
      if (i === k) OLED.rect(x, y, cw - 1, 5, on ? 1 : 0.35, AMBER);
      else if (on) OLED.rect(x, y, cw - 1, 5, 0.85);
      else OLED.px(x + (cw >> 1), y + 2, i % 4 === 0 ? 0.35 : 0.15);
    }
  });
  OLED.text('HOLD KEY + ↑↓ = VARIATION', W / 2, H - 7, { align: 'c', b: 0.62 });
}
function drawDrum() {
  const W = OLED.W, H = OLED.H, n = performance.now();
  OLED.text(DRUM_KITS[S.drumKit].name, 3, 13, { s: 3 });
  OLED.text('KIT ' + (S.drumKit + 1) + '/7', W - 3, 13, { align: 'r', b: 0.6 });
  const pw = Math.floor((W - 4) / 7), labels = ['KCK', 'SNR', 'CLP', 'HAT', 'TOM', 'BEL', 'CYM'];
  const py = 33, ph = Math.max(16, H - py - 20);
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * pw, t = R.flash[i] ? (n - R.flash[i]) / 380 : 9, b = Math.max(0, 1 - t);
    OLED.frame(x, py, pw - 3, ph, 0.35);
    if (b > 0) { const fh = Math.round((ph - 2) * (0.35 + 0.65 * b)); OLED.rect(x + 1, py + ph - 1 - fh, pw - 5, fh, b, AMBER); }
    OLED.text(labels[i], x + (pw - 3) / 2, py + ph - 8, { align: 'c', b: b > 0.4 ? -1 : 0.7 });
  }
  drawLoops(H - 7);
  OLED.text('KIT ' + (S.drumKit + 1) + '/7  ←→ CHANGE', W - 3, H - 7, { align: 'r', b: 0.6 });
}
function drawHiro() {
  const W = OLED.W, H = OLED.H, Hh = R.hiro;
  if (!Hh) {
    OLED.text('CHORD', W / 2, 14, { s: 3, align: 'c' }); OLED.text('HERO', W / 2, 32, { s: 3, align: 'c', c: AMBER });
    OLED.jp('流れてくる度数を小節頭で押す', W / 2, 58, { align: 'c', b: 0.6 });
    OLED.text('TAP STICK TO START', W / 2, H - 8, { align: 'c', b: blink() ? 0.9 : 0.4 });
    return;
  }
  const b = Tr.beatNow(), hitX = 22, y0 = 14, laneH = 26, span = W - hitX - 4;
  OLED.frame(0, y0, W, laneH, 0.15);
  for (let x = y0; x < y0 + laneH; x += 2) OLED.px(hitX, x, 0.9, AMBER);
  for (let j = 0; j < 16; j++) {
    const x = hitX + ((Hh.start + 4 * j) - b) / 12 * span; if (x < -10 || x > W + 10) continue;
    const r = romanFor(Hh.prog[j], degreeInfo(curScale(), Hh.prog[j]).q), jd = Hh.judged[j];
    OLED.text(r, x, y0 + 8, { s: 2, align: 'c', c: jd === 'PERFECT' ? AMBER : 0, b: jd === 'MISS' ? 0.25 : 1 });
    if (jd === 'MISS') OLED.hline(Math.round(x - 6), y0 + 12, 12, 0.5, RED);
  }
  if (Hh.running && b < Hh.start) OLED.text(String(Math.ceil(Hh.start - b)), W / 2, 46, { s: 4, align: 'c', c: AMBER });
  else OLED.text(Hh.running ? (Hh.last || '') : Hh.msg, W / 2, 48, { s: 3, align: 'c', c: Hh.last === 'PERFECT' ? AMBER : Hh.last === 'MISS' ? RED : 0 });
  const bar = Math.max(0, Math.min(16, Math.floor((b - Hh.start) / 4) + 1));
  OLED.text('SCORE ' + Hh.score, 3, H - 7, { b: 0.7 });
  OLED.text(Hh.running ? 'BAR ' + bar + '/16' : 'TAP = RETRY', W - 3, H - 7, { align: 'r', b: 0.7 });
}
function drawEar() {
  const W = OLED.W, H = OLED.H, E = R.ear;
  const big = E.deg == null ? '?' : E.answered ? (E.lastOk ? '○' : '×') : '?';
  OLED.text(big, W / 2, 14, { s: 6, align: 'c', c: E.answered && E.deg != null ? (E.lastOk ? AMBER : RED) : 0 });
  OLED.jp(E.msg || 'スティックをタップで出題', W / 2, 54, { align: 'c', b: 0.8 });
  OLED.text('SCORE ' + E.ok + '/' + E.total, 3, H - 7, { b: 0.7 });
  OLED.text(E.deg == null || E.answered ? 'TAP = NEXT' : 'TAP = REPLAY', W - 3, H - 7, { align: 'r', b: 0.7 });
}
function drawMixer() {
  const W = OLED.W, H = OLED.H, sw = Math.floor((W - 4) / 6), anySolo = S.tracks.some(t => t.solo);
  S.tracks.forEach((t, i) => {
    const x = 2 + i * sw, sel = i === R.mixSel;
    if (sel) OLED.frame(x, 11, sw - 2, H - 20, 0.8, AMBER);
    loopShape(i, x + (sw - 2) / 2 - 2, 14, t.state === 'EMPTY' ? 'empty' : t.mute ? 'off' : 'play');
    const fh = H - 46, fy = 23, lvl = Math.round(fh * Math.min(1, t.vol));
    OLED.frame(x + (sw - 2) / 2 - 3, fy, 7, fh, 0.2);
    if (t.state !== 'EMPTY') OLED.rect(x + (sw - 2) / 2 - 2, fy + fh - lvl, 5, lvl, t.mute || (anySolo && !t.solo) ? 0.25 : 0.9, t.solo ? AMBER : 0);
    OLED.text(t.state === 'EMPTY' ? '--' : t.mute ? 'M' : t.solo ? 'S' : String(Math.round(t.vol * 10)), x + (sw - 2) / 2, H - 18, { align: 'c', b: 0.7, c: t.solo ? AMBER : t.mute ? RED : 0 });
  });
  OLED.text('TAP KEY = MUTE', W / 2, H - 6, { align: 'c', b: 0.62 });
}
function drawWaiting() {
  const W = OLED.W, H = OLED.H;
  OLED.text('LOOP LENGTH', W / 2, 13, { align: 'c', b: 0.6 });
  OLED.text(S.loopBars ? String(S.loopBars) : 'FREE', W / 2, 24, { s: 5, align: 'c', c: AMBER });
  OLED.text(S.loopBars ? (S.loopBars > 1 ? 'BARS' : 'BAR') : 'STOP WITH A TAP', W / 2, 55, { align: 'c', b: 0.7 });
  OLED.text('◀', 6, 30, { s: 3, b: 0.7 }); OLED.text('▶', W - 6, 30, { s: 3, b: 0.7, align: 'r' });
  OLED.jp('タップで4拍カウント→録音', W / 2, H - 16, { align: 'c', b: 0.8 });
}
function drawCountIn() {
  const W = OLED.W, H = OLED.H, b = Tr.beatNow(), k = Math.floor(b - R.countIn.start);
  const n = Math.max(1, 4 - Math.max(0, k));
  OLED.text(String(n), W / 2, 16, { s: 8, align: 'c', c: RED });
  for (let i = 0; i < 4; i++) OLED.rect(W / 2 - 14 + i * 8, 62, 5, 5, i <= k ? 1 : 0.2, i <= k ? RED : 0);
  OLED.text('RECORDING TRACK ' + (R.rec ? R.rec.track + 1 : 1), W / 2, H - 8, { align: 'c', b: 0.7 });
}
function drawBoot() {
  const W = OLED.W, H = OLED.H, t = (performance.now() - R.boot.t0) / 1000;
  const reveal = Math.min(1, t / 1.1);
  const cy = Math.round(H / 2 - 24);
  OLED.text('CHORD', W / 2, cy, { s: 4, align: 'c', mask: (x, y) => hash2(x, y) < reveal });
  OLED.text('POCKET', W / 2, cy + 24, { s: 4, align: 'c', c: AMBER, mask: (x, y) => hash2(y, x) < reveal * 1.1 - 0.1 });
  if (t > 0.9) {
    const sweep = Math.min(W, (t - 0.9) * W * 2.4);
    OLED.hline(Math.round(W / 2 - sweep / 2), cy + 47, Math.round(sweep), 0.4);
  }
  if (t > 1.3) OLED.text('CP-7  DIATONIC CHORD INSTRUMENT', W / 2, cy + 52, { align: 'c', b: 0.45 });
  if (t > 1.7) OLED.jp(R.started ? '起動中…' : 'タッチで起動', W / 2, H - 14, { align: 'c', b: blink(1400) ? 1 : 0.45 });
}

function drawScreen() {
  if (!OLED.buf) return;
  const now = R.started ? Engine.now() : 0;
  OLED.clear();
  if (R.boot) drawBoot();
  else if (R.menu) drawMenu();
  else {
    drawStatus(now);
    if (R.countIn) drawCountIn();
    else if (R.waiting) drawWaiting();
    else if (S.mode === 'SEQ') drawSeq(now);
    else if (S.mode === 'DRUMLOOP') drawDrumLoop();
    else if (S.mode === 'DRUM') drawDrum();
    else if (S.mode === 'HIRO') drawHiro();
    else if (S.mode === 'EAR') drawEar();
    else if (S.mode === 'MIXER') drawMixer();
    else drawHome(now);
  }
  drawToast();
  OLED.present();
}
