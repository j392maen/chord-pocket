/* ===== App state ===== */
const MODES = ['PLAY','STRUM','LEAD','DRONE','ARP','REPEAT','SEQ','DRUM','DRUMLOOP','HIRO','EAR','MIXER'];
const MODE_JP = { PLAY:'プレイ', STRUM:'ストラム', LEAD:'リード', DRONE:'ドローン', ARP:'アルペジオ', REPEAT:'リピート', SEQ:'シーケンサ', DRUM:'ドラム', DRUMLOOP:'ドラムループ', HIRO:'コードヒーロー', EAR:'イヤートレーナー', MIXER:'ミキサー' };
const RATES = { '1/1':4, '1/2':2, '1/4':1, '1/8':0.5, '1/16':0.25, '1/16T':1/6, '1/32':0.125, 'SW8':0.5, 'SW16':0.25 };
const RATE_KEYS = Object.keys(RATES);
const RATE_LABEL = k => k === 'SW8' ? 'SWING 8th' : k === 'SW16' ? 'SWING 16th' : k;
const DELAY_RATES = ['1/4','1/8','1/16','1/16T'];
const STRUM_MS = { SLOW:120, MED:80, FAST:40 };
const ARP_PATTERNS = ['UP','DOWN','UP/DOWN','DOWN/UP','RANDOM','FINGERPICK'];
const ARP_LAYERS = ['ARP ONLY','CHORD+ARP','RHYTHM+ARP'];
const SEQ_STEPLEN = { '1拍':1, '2拍':2, '1小節':4 };
const DRUM_STYLES = ['ROCK','DISCO','REGGAE','FUNK','HIP-HOP','ELECTRO','JAZZ'];
const DRUM_VARS = ['ORIGINAL','GHOST','BUSY HATS','SYNC KICK','FILL','HALF-TIME','DOUBLE-TIME','JAZZ'];
const PROGRESSIONS = [[0,4,5,3],[3,4,2,5],[5,3,0,4],[0,5,3,4],[1,4,0,5],[0,3,4,3],[5,4,3,4],[3,4,5,5]];

function defaultState() {
  return {
    v: 1, keyPc: 0, scaleIdx: 0, globalOct: 0, joyMode: 'DEFAULT', bpm: 100, volume: 0.8,
    session: 'ambient', midiOut: false, metronome: true,
    patch: { sound: 'epiano', env: 'TOUCH', attackMs: null, releaseMs: null, level: 1,
      fx: { reverb: 0.25, delay: 0, delayRate: '1/8', chorus: 0, flanger: 0, tremolo: 0, tremRate: 5, vibrato: 0,
            cutoff: 20000, glide: 0.2, stereo: 0.3, voices: 2, bassMode: 'OFF', voiceLead: false } },
    mode: 'PLAY', strum: 'MED', arpPattern: 'UP', arpRate: '1/8', arpLayer: 'ARP ONLY', repeatRate: '1/8',
    seqStepLen: '1小節', drumKit: 0, loopBars: 0,
    buttons: Array.from({ length: 7 }, () => ({ oct: 0, inv: 0, lock: null })),
    presets: [null, null, null, null],
    seq: { steps: [null, null, null, null] },
    tracks: Array.from({ length: 6 }, () => ({ events: [], patch: null, vol: 1, mute: false, solo: false, state: 'EMPTY' })),
    loop: { len: 0 },
  };
}
let S = defaultState();
const STORE_KEY = 'chord-pocket.v1';
function load() {
  try { const raw = (window.__CP_SAVED && JSON.stringify(window.__CP_SAVED)) || localStorage.getItem(STORE_KEY); if (!raw) return; const d = JSON.parse(raw); if (d && d.v === 1) S = Object.assign(defaultState(), d); S.patch.fx = Object.assign(defaultState().patch.fx, S.patch.fx); } catch (e) {}
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const json = JSON.stringify(S);
    try { localStorage.setItem(STORE_KEY, json); } catch (e) {}
    if (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) { try { window.webkit.messageHandlers.cp.postMessage({ op: 'save', data: json }); } catch (e) {} }
  }, 400);
}

/* ===== Runtime ===== */
const R = {
  started: false, live: null, drums: null, trackCh: [], trackDrum: [],
  held: new Map(), order: [], joyDir: 'C', menu: null, menuIdx: { key: 0, sound: 0, mode: 0, preset: 0 },
  btnDown: [false, false, false], comboUsed: [false, false, false],
  prevNotes: null, lastChord: null, drone: null, lead: null, leadMidi: null,
  arp: null, rep: null, seqPlay: null, seqCursor: 0, dl: null, dlStyle: 0, dlVar: 0,
  rec: null, waiting: false, countIn: null, L0: 0,
  ear: { deg: null, answered: true, ok: 0, total: 0, msg: '' },
  hiro: null, mixSel: 0, toast: null, taps: [], midi: null, userLoaded: false, onboard: 0, lit: new Map(),
  lastB: 0, anchor: 0, flash: {},
};

/* ===== Transport ===== */
const Tr = {
  beatAt(t) { return (t - R.anchor) * S.bpm / 60; },
  timeAt(b) { return R.anchor + b * 60 / S.bpm; },
  beatNow() { return this.beatAt(Engine.now()); },
  setBpm(v) {
    v = Math.max(40, Math.min(300, Math.round(v)));
    if (Engine.ready) { const now = Engine.now(), b = this.beatAt(now); S.bpm = v; R.anchor = now - b * 60 / v; updateDelayTime(); }
    else S.bpm = v;
    save();
  },
};
function updateDelayTime() { if (Engine.ready) Engine.setDelayTime(RATES[S.patch.fx.delayRate] * 60 / S.bpm); }

/* ===== Start audio (on first touch) ===== */
function startAudio() {
  if (Engine.setSession) Engine.sessionType = S.session;
  Engine.ensure();
  if (R.started) return;
  R.started = true;
  R.anchor = Engine.now(); R.lastB = 0;
  R.live = Engine.newChannel(S.patch);
  R.drums = Engine.newDrums(); R.drums.kit = S.drumKit;
  S.tracks.forEach((t, i) => { if (t.state !== 'EMPTY') buildTrack(i); });
  if (S.tracks.some(t => t.state !== 'EMPTY')) R.L0 = 0;
  applyMix();
  Engine.setVolume(S.volume);
  updateDelayTime();
  warmSound();
  setInterval(tick, 25);
  if (S.midiOut) initMidi();
  if (typeof onStarted === 'function') onStarted();
}
function warmSound() {
  const snd = SOUND_BY_ID[S.patch.sound];
  if (snd && snd.eng === 'render') { const ms = []; for (let d = 0; d <= 24; d++) { ms.push(60 + d); if (d) ms.push(60 - d); } Engine.prerender(snd.kind, ms.filter(m => m >= 36 && m <= 88)); }
}

/* ===== Live output (records to looper + MIDI) ===== */
function liveOn(midi, vel, time, opts) {
  const v = R.live.noteOn(midi, vel, time, opts);
  v.recB = Tr.beatAt(Math.max(time || 0, Engine.now())); v.recVel = vel;
  midiSend(0x90, midi, Math.round((vel || 0.8) * 110), time);
  return v;
}
function liveOff(v, time) {
  if (!v || v.offDone) return; v.offDone = true;
  const t = Math.max(time || 0, Engine.now());
  R.live.noteOff(v, t);
  recordNote(v.midi, v.recVel, v.recB, Tr.beatAt(t));
  midiSend(0x80, v.midi, 0, t);
}
function liveNote(midi, vel, time, dur, opts) { const v = liveOn(midi, vel, time, opts); liveOff(v, time + dur); return v; }
function drumHit(i, time, vel, kit) {
  R.drums.hit(i, time, vel, kit);
  recordDrum(i, Tr.beatAt(Math.max(time, Engine.now())), vel, kit == null ? S.drumKit : kit);
  midiSend(0x99, [36, 38, 39, 42, 45, 56, 49, 46, 51][i] || 36, Math.round(vel * 110), time);
}

/* ===== Chords ===== */
function curScale() { return SCALES[S.scaleIdx]; }
function chordFor(i, dir, opts) {
  const b = S.buttons[i];
  return buildChord({ keyPc: S.keyPc, scale: curScale(), deg: i, dir: dir == null ? R.joyDir : dir, joyMode: S.joyMode,
    lockedType: b.lock, btnOct: b.oct, globalOct: S.globalOct, inversion: b.inv,
    voiceLead: S.patch.fx.voiceLead, prevNotes: R.prevNotes, bassMode: S.patch.fx.bassMode === 'OFF' ? null : S.patch.fx.bassMode,
    slashDeg: opts && opts.slashDeg });
}
function allNotes(ch) { return ch.bass != null ? [ch.bass, ...ch.notes] : ch.notes.slice(); }

function chordPress(i) {
  const now = Engine.now();
  haptic('light');
  const already = R.held.get(i);
  if (already) releaseVoices(already);          // same key pressed again before its release arrived
  let slashDeg = null;
  if (S.patch.fx.bassMode === 'SLASH' && R.order.length) slashDeg = R.order[R.order.length - 1];
  if (slashDeg != null) { const prev = R.held.get(slashDeg); if (prev) releaseVoices(prev); }
  const ch = chordFor(i, null, { slashDeg });
  const h = { i, ch, voices: [], slashDeg };
  R.held.set(i, h); R.order = R.order.filter(x => x !== i); R.order.push(i);
  R.lastChord = ch; R.prevNotes = ch.notes; R.chordT0 = performance.now();
  R.hist = (R.hist || []).concat([{ roman: ch.roman, name: ch.name }]).slice(-6);
  closeMenu();
  soundChord(h, now, false);
  render();
}
function soundChord(h, now, isChange) {
  const ch = h.ch, m = S.mode;
  if (m === 'PLAY' || m === 'SEQ' || m === 'HIRO') {
    h.voices = allNotes(ch).map(n => liveOn(n, 0.8, now));
  } else if (m === 'STRUM') {
    const sp = isChange ? 0 : STRUM_MS[S.strum] / 1000;
    h.voices = allNotes(ch).map((n, k) => liveOn(n, 0.8, now + k * sp));
  } else if (m === 'LEAD') {
    const midi = ch.rootMidi + 12;
    if (R.lead && !R.lead.offDone) { R.live.glideTo(R.lead, midi, now); }
    else { R.lead = liveOn(midi, 0.85, now, { glideFrom: R.leadMidi }); }
    R.leadMidi = midi;
  } else if (m === 'DRONE') {
    if (R.drone && R.drone.i === h.i && !isChange) { stopDrone(); h.silent = true; return; }
    stopDrone();
    R.drone = { i: h.i, voices: allNotes(ch).map(n => liveOn(n, 0.75, now)) };
  } else if (m === 'ARP') {
    const layer = S.arpLayer;
    if (layer === 'CHORD+ARP') h.voices = allNotes(ch).map(n => liveOn(n, 0.45, now));
    const notes = ch.notes.concat(ch.notes.map(n => n + 12));
    if (!R.arp) { R.arp = { notes, idx: 0, dir: 1, nextK: null, bass: ch.bass }; arpStep(now, true); }
    else { R.arp.notes = notes; R.arp.bass = ch.bass; }
  } else if (m === 'REPEAT') {
    if (!R.rep) { R.rep = { notes: allNotes(ch), nextK: null }; allNotes(ch).forEach(n => liveNote(n, 0.8, now, RATES[S.repeatRate] * 60 / S.bpm * 0.5)); }
    else R.rep.notes = allNotes(ch);
  }
}
function releaseVoices(h) { const t = Engine.now(); (h.voices || []).forEach(v => liveOff(v, t)); h.voices = []; }
function stopDrone() { if (R.drone) { const t = Engine.now(); R.drone.voices.forEach(v => liveOff(v, t)); R.drone = null; } }

function chordRelease(i) {
  const h = R.held.get(i); if (!h) return;
  R.held.delete(i); R.order = R.order.filter(x => x !== i);
  const now = Engine.now(), m = S.mode;
  releaseVoices(h);
  if (m === 'LEAD') {
    if (R.order.length) { const o = R.held.get(R.order[R.order.length - 1]); const midi = o.ch.rootMidi + 12; if (R.lead) R.live.glideTo(R.lead, midi, now); R.leadMidi = midi; }
    else if (R.lead) { liveOff(R.lead, now); R.lead = null; }
  }
  if (m === 'ARP' || m === 'REPEAT') {
    if (R.order.length) { const o = R.held.get(R.order[R.order.length - 1]); if (R.arp) { R.arp.notes = o.ch.notes.concat(o.ch.notes.map(n => n + 12)); } if (R.rep) R.rep.notes = allNotes(o.ch); }
    else { R.arp = null; R.rep = null; }
  }
  if (m === 'SEQ') seqStore(i, h.ch);
  render();
}
/* joystick moved while holding → re-voice the most recent held chord */
function rechord() {
  if (!R.order.length) return;
  const i = R.order[R.order.length - 1], h = R.held.get(i);
  const saved = R.prevNotes; R.prevNotes = h.ch.notes;
  const ch = chordFor(i, null, { slashDeg: h.slashDeg });
  R.prevNotes = ch.notes;
  if (ch.name === h.ch.name && ch.notes.join() === h.ch.notes.join()) return;
  h.ch = ch; R.lastChord = ch;
  const now = Engine.now();
  if (S.mode === 'LEAD') { render(); return; }
  if (S.mode === 'ARP') { if (h.voices.length) { releaseVoices(h); h.voices = allNotes(ch).map(n => liveOn(n, 0.45, now)); } R.arp && (R.arp.notes = ch.notes.concat(ch.notes.map(n => n + 12))); render(); return; }
  if (S.mode === 'REPEAT') { R.rep && (R.rep.notes = allNotes(ch)); render(); return; }
  if (S.mode === 'DRONE') { stopDrone(); R.drone = { i, voices: allNotes(ch).map(n => liveOn(n, 0.75, now)) }; render(); return; }
  releaseVoices(h);
  h.voices = allNotes(ch).map(n => liveOn(n, 0.8, now));
  render();
}

/* ===== Arp / Repeat scheduling ===== */
function arpNoteAt(a) {
  const n = a.notes, L = n.length, p = S.arpPattern;
  let idx;
  if (p === 'UP') idx = a.idx % L;
  else if (p === 'DOWN') idx = L - 1 - (a.idx % L);
  else if (p === 'UP/DOWN' || p === 'DOWN/UP') { const per = Math.max(1, 2 * L - 2), k = a.idx % per, up = k < L ? k : per - k; idx = p === 'UP/DOWN' ? up : L - 1 - up; }
  else if (p === 'RANDOM') idx = Math.floor(Math.random() * L);
  else { const pat = [0, 2, 1, 2, 3, 2, 1, 2]; idx = pat[a.idx % 8] % Math.min(L, 4); }
  a.idx++;
  return n[idx];
}
function stepBeat(k, rateKey) {
  const r = RATES[rateKey];
  let b = k * r;
  if (rateKey.startsWith('SW') && (k % 2 === 1)) b += r / 3;
  return b;
}
function arpStep(time) {
  const a = R.arp; if (!a) return;
  const r = RATES[S.arpRate], dur = r * 60 / S.bpm * 0.85;
  liveNote(arpNoteAt(a), 0.75, time, dur);
  const b = Tr.beatAt(time);
  let k = Math.floor(b / r) + 1; if (k * r - b < r * 0.4) k++;
  a.nextK = k;
}
function schedArp(b0, b1) {
  const a = R.arp; if (!a || a.nextK == null) return;
  const r = RATES[S.arpRate];
  while (true) {
    const bb = stepBeat(a.nextK, S.arpRate); if (bb >= b1) break;
    if (bb >= b0 - 0.01) {
      const t = Tr.timeAt(bb), dur = r * 60 / S.bpm * 0.85;
      liveNote(arpNoteAt(a), 0.75, t, dur);
      if (S.arpLayer === 'RHYTHM+ARP' && Math.abs(bb - Math.round(bb)) < 1e-6) {
        const h = R.held.get(R.order[R.order.length - 1]); if (h) allNotes(h.ch).forEach(n => liveNote(n - 12 >= 36 ? n : n, 0.45, t, 60 / S.bpm * 0.5));
      }
    }
    a.nextK++;
  }
}
function schedRepeat(b0, b1) {
  const p = R.rep; if (!p) return;
  const r = RATES[S.repeatRate];
  if (p.nextK == null) { const b = Tr.beatAt(Engine.now()); p.nextK = Math.floor(b / r) + 1; if (p.nextK * r - b < r * 0.4) p.nextK++; }
  while (true) {
    const bb = stepBeat(p.nextK, S.repeatRate); if (bb >= b1) break;
    if (bb >= b0 - 0.01) { const t = Tr.timeAt(bb); p.notes.forEach(n => liveNote(n, 0.75, t, r * 60 / S.bpm * 0.5)); }
    p.nextK++;
  }
}

/* ===== Sequencer ===== */
function seqStore(i, ch) {
  const st = S.seq.steps;
  st[R.seqCursor] = { deg: i, type: ch.typeId, bass: S.patch.fx.bassMode, slash: null, name: ch.name, roman: ch.roman };
  if (!R.seqPlay) R.seqCursor = (R.seqCursor + 1) % st.length;
  save();
}
function seqChord(step) {
  const b = S.buttons[step.deg];
  return buildChord({ keyPc: S.keyPc, scale: curScale(), deg: step.deg, dir: 'C', joyMode: S.joyMode, lockedType: step.type,
    btnOct: b.oct, globalOct: S.globalOct, inversion: b.inv, voiceLead: false, bassMode: step.bass === 'OFF' ? null : step.bass });
}
function seqToggle() {
  if (R.seqPlay) { R.seqPlay = null; }
  else { const b = Tr.beatNow(); R.seqPlay = { sb: Math.ceil(b + 0.05), nextK: 0 }; if (R.L0 != null && S.loop.len) R.seqPlay.sb = nextBoundary(b); }
  render();
}
function nextBoundary(b) { if (!S.loop.len) return Math.ceil(b); const k = Math.ceil((b - R.L0) / S.loop.len); return R.L0 + k * S.loop.len; }
function schedSeq(b0, b1) {
  const p = R.seqPlay; if (!p) return;
  const L = SEQ_STEPLEN[S.seqStepLen], st = S.seq.steps;
  while (true) {
    const bb = p.sb + p.nextK * L; if (bb >= b1) break;
    if (bb >= b0 - 0.01) {
      const step = st[p.nextK % st.length];
      if (step) { const ch = seqChord(step); const t = Tr.timeAt(bb); allNotes(ch).forEach(n => liveNote(n, 0.75, t, L * 60 / S.bpm * 0.95)); R.lastChord = ch; }
    }
    p.nextK++;
  }
}

/* ===== Drum loops ===== */
const DL_BASE = [
  { K:'x.......x.x.....', S:'....x.......x...', H:'x.x.x.x.x.x.x.x.', sw:0 },
  { K:'x...x...x...x...', S:'....x.......x...', H:'x.x.x.x.x.x.x.x.', O:'..x...x...x...x.', sw:0 },
  { K:'........x.......', S:'........x.......', H:'x.x.x.x.x.x.x.x.', sw:0.2 },
  { K:'x..x..x...x..x..', S:'....x..x.x..x...', H:'xxxxxxxxxxxxxxxx', sw:0.1 },
  { K:'x......x..x.....', S:'....x.......x...', H:'x.x.x.x.x.x.x.x.', sw:0.25 },
  { K:'x.....x...x.....', S:'....x.......x...', C:'....x.......x...', H:'..x...x...x...x.', sw:0 },
  { K:'x.......x.......', S:'......x.......x.', R:'x...x..xx...x..x', H:'....x.......x...', sw:0.33 },
];
function dlPattern(style, v) {
  const b = DL_BASE[style], p = { K: b.K, S: b.S, H: b.H || '', O: b.O || '', C: b.C || '', R: b.R || '', T: '', G: '', sw: b.sw, half: false };
  const set = (s, i, c) => s.substring(0, i) + c + s.substring(i + 1);
  if (v === 1) { p.G = '..x....x..x....x'; }
  if (v === 2) { p.H = 'xxxxxxxxxxxxxxxx'; }
  if (v === 3) { p.K = set(set(p.K, 3, 'x'), 11, 'x'); p.K = set(p.K, 14, 'x'); }
  if (v === 4) { p.S = p.S.substring(0, 12) + 'x.xx'; p.T = '............x.x.'; }
  if (v === 5) { p.S = '........x.......'; p.K = 'x.........x.....'; }
  if (v === 6) { const d = s => s ? (s.substring(0, 8) + s.substring(0, 8)).split('').map((c, i) => c).join('') : s; p.K = 'x...x...x...x...'; p.S = '..x...x...x...x.'; p.H = 'xxxxxxxxxxxxxxxx'; }
  if (v === 7) { p.R = 'x...x..xx...x..x'; p.H = '....x.......x...'; p.sw = 0.33; p.G = '......x.......x.'; }
  return p;
}
function dlHits(p, step) {
  const out = [];
  const c = (s, i) => s && s[i] === 'x';
  if (c(p.K, step)) out.push([0, 1]);
  if (c(p.S, step)) out.push([1, 0.9]);
  if (c(p.C, step)) out.push([2, 0.8]);
  if (c(p.H, step)) out.push([3, step % 4 === 0 ? 0.8 : 0.5]);
  if (c(p.O, step)) out.push([7, 0.6]);
  if (c(p.R, step)) out.push([8, 0.8]);
  if (c(p.T, step)) out.push([4, 0.8]);
  if (c(p.G, step)) out.push([1, 0.25]);
  return out;
}
function dlToggle(style) {
  if (R.dl && R.dlStyle === style) { R.dl = null; render(); return; }
  R.dlStyle = style;
  if (!R.dl) { const b = Tr.beatNow(); R.dl = { sb: S.loop.len ? nextBoundary(b) : Math.ceil(b + 0.05), nextK: 0 }; }
  render();
}
function schedDL(b0, b1) {
  const p = R.dl; if (!p) return;
  const pat = dlPattern(R.dlStyle, R.dlVar);
  while (true) {
    const k = p.nextK; let bb = p.sb + k * 0.25; if (k % 2 === 1) bb += 0.25 * pat.sw;
    if (bb >= b1) break;
    if (bb >= b0 - 0.01) { const t = Tr.timeAt(bb); dlHits(pat, k % 16).forEach(([i, v]) => drumHit(i, t, v)); }
    p.nextK++;
  }
}

/* ===== Looper ===== */
function recordNote(midi, vel, b0, b1) {
  const r = R.rec; if (!r || !r.active) return;
  if (b1 - r.start < 0.1) return;
  if (b0 < r.start) b0 = r.start; // notes held into the start are carried in
  r.events.push({ t: 'n', m: midi, v: vel || 0.8, b: b0 - r.start, d: Math.max(0.02, b1 - b0) });
}
function recordDrum(i, b, vel, kit) {
  const r = R.rec; if (!r || !r.active) return;
  if (b < r.start) { if (r.start - b > 0.3) return; b = r.start; }
  r.events.push({ t: 'd', i, v: vel, k: kit, b: b - r.start });
}
function nextEmptyTrack() { return S.tracks.findIndex(t => t.state === 'EMPTY'); }
function looperClick() {
  if (R.rec && R.rec.active) { stopRecording(); return; }
  if (R.countIn) { R.countIn = null; R.rec = null; R.waiting = false; toast('CANCELLED'); render(); return; }
  const empty = nextEmptyTrack();
  if (!S.loop.len) {
    if (!R.waiting) { R.waiting = true; closeMenu(); render(); return; }
    R.waiting = false;
    const cb = Math.ceil(Tr.beatNow() + 0.1);
    R.countIn = { start: cb, end: cb + 4 };
    R.rec = { track: 0, start: cb + 4, active: false, first: true, events: [], stopAt: S.loopBars ? cb + 4 + S.loopBars * 4 : null };
    render(); return;
  }
  if (empty < 0) { toast('6/6 FULL · HOLD STICK TO CLEAR'); return; }
  const b = Tr.beatNow();
  R.rec = { track: empty, start: b, active: true, first: false, events: [], stopAt: b + S.loop.len };
  S.tracks[empty].state = 'REC';
  render();
}
function beginRecording() { // after count-in
  const r = R.rec; r.active = true; R.countIn = null;
  if (r.first) R.L0 = r.start;
  S.tracks[r.track].state = 'REC';
  // notes already held carry into the recording
  render();
}
function stopRecording(atBeat) {
  const r = R.rec; if (!r) return;
  const bStop = atBeat != null ? atBeat : Tr.beatNow();
  // close held live notes into the recording
  for (const v of R.live.voices) if (!v.offDone && v.recB != null) recordNote(v.midi, v.recVel, v.recB, bStop);
  let len = S.loop.len;
  if (r.first) {
    len = S.loopBars ? S.loopBars * 4 : bStop - r.start;
    if (len < 0.5) { R.rec = null; S.tracks[r.track].state = 'EMPTY'; toast('TOO SHORT'); render(); return; }
    S.loop.len = len; R.L0 = r.start;
  }
  const off = r.first ? 0 : ((r.start - R.L0) % len + len) % len;
  const events = r.events.map(e => Object.assign({}, e, { b: (e.b + off) % len })).filter(e => e.b < len);
  const t = S.tracks[r.track];
  t.events = events; t.patch = JSON.parse(JSON.stringify(S.patch)); t.state = 'PLAY';
  R.rec = null;
  buildTrack(r.track);
  // events inside the current scheduler window must not double-sound
  save(); render();
}
function buildTrack(i) {
  if (!Engine.ready) return;
  if (R.trackCh[i]) R.trackCh[i].dispose();
  const t = S.tracks[i];
  R.trackCh[i] = Engine.newChannel(t.patch || S.patch);
  if (!R.trackDrum[i]) R.trackDrum[i] = Engine.newDrums();
  const snd = SOUND_BY_ID[(t.patch || S.patch).sound]; if (snd && snd.eng === 'render') { const ms = new Set(t.events.filter(e => e.t === 'n').map(e => Math.round(e.m))); Engine.prerender(snd.kind, [...ms]); }
  applyMix();
}
function clearAll() {
  if (R.rec) R.rec = null; R.countIn = null; R.waiting = false;
  S.tracks.forEach((t, i) => { t.events = []; t.state = 'EMPTY'; t.patch = null; t.mute = false; t.solo = false; t.vol = 1; if (R.trackCh[i]) { R.trackCh[i].dispose(); R.trackCh[i] = null; } });
  S.loop.len = 0; applyMix(); save(); toast('LOOPS CLEARED'); render();
}
function clearTrack(i) { const t = S.tracks[i]; t.events = []; t.state = 'EMPTY'; t.patch = null; if (R.trackCh[i]) { R.trackCh[i].dispose(); R.trackCh[i] = null; } if (S.tracks.every(x => x.state === 'EMPTY')) S.loop.len = 0; save(); render(); }
function applyMix() {
  const anySolo = S.tracks.some(t => t.solo);
  S.tracks.forEach((t, i) => {
    const on = t.state === 'PLAY' && !t.mute && (!anySolo || t.solo), g = on ? t.vol : 0, now = Engine.now();
    if (R.trackCh[i]) R.trackCh[i].setGate(g);
    if (R.trackDrum[i]) R.trackDrum[i].setGate(g);
  });
}
function schedLooper(b0, b1) {
  const len = S.loop.len; if (!len) return;
  S.tracks.forEach((t, i) => {
    if (t.state !== 'PLAY' || !R.trackCh[i]) return;
    for (const e of t.events) {
      let n = Math.ceil((b0 - R.L0 - e.b) / len - 1e-9);
      for (let bb = R.L0 + e.b + n * len; bb < b1; bb += len) {
        if (bb < b0) continue;
        const time = Tr.timeAt(bb);
        if (e.t === 'n') { const v = R.trackCh[i].noteOn(e.m, e.v, time); R.trackCh[i].noteOff(v, Tr.timeAt(bb + e.d)); }
        else R.trackDrum[i].hit(e.i, time, e.v, e.k);
      }
    }
  });
}
/* auto-bounce SEQ / DRUMLOOP into the next empty looper track */
function autoBounce(kind) {
  const idx = nextEmptyTrack(); if (idx < 0) { toast('NO EMPTY TRACK'); return; }
  let patLen, sb;
  if (kind === 'SEQ') { patLen = SEQ_STEPLEN[S.seqStepLen] * S.seq.steps.length; sb = R.seqPlay.sb; }
  else { patLen = 4; sb = R.dl.sb; }
  if (!S.loop.len) { S.loop.len = patLen; R.L0 = sb; }
  const len = S.loop.len, ev = [];
  if (kind === 'SEQ') {
    const L = SEQ_STEPLEN[S.seqStepLen];
    for (let x = 0; x < len - 1e-6; x += L) {
      const g = R.L0 + x, k = Math.round((g - sb) / L), st = S.seq.steps[((k % S.seq.steps.length) + S.seq.steps.length) % S.seq.steps.length];
      if (st) allNotes(seqChord(st)).forEach(m => ev.push({ t: 'n', m, v: 0.75, b: x, d: L * 0.95 }));
    }
  } else {
    const pat = dlPattern(R.dlStyle, R.dlVar);
    for (let x = 0; x < len - 1e-6; x += 0.25) {
      const g = R.L0 + x, k = Math.round((g - sb) / 0.25); let off = (((k % 2) + 2) % 2 === 1) ? 0.25 * pat.sw : 0;
      dlHits(pat, ((k % 16) + 16) % 16).forEach(([i, v]) => ev.push({ t: 'd', i, v, k: S.drumKit, b: x + off }));
    }
  }
  const t = S.tracks[idx]; t.events = ev; t.patch = JSON.parse(JSON.stringify(S.patch)); t.state = 'PLAY';
  buildTrack(idx); applyMix(); save();
  toast('BOUNCED TO TRACK ' + (idx + 1));
}

/* ===== Metronome / count-in / game scheduling ===== */
function click(time, accent) { Engine.click(time, accent); }
function schedClicks(b0, b1) {
  for (let b = Math.ceil(b0 - 1e-9); b < b1; b++) {
    if (R.countIn && b >= R.countIn.start && b < R.countIn.end) click(Tr.timeAt(b), b === R.countIn.start);
    else if (R.rec && R.rec.active && S.metronome) click(Tr.timeAt(b), ((b - R.L0) % 4 + 4) % 4 < 0.01);
    else if (R.hiro && R.hiro.running && b >= R.hiro.start - 4) click(Tr.timeAt(b), ((b - R.hiro.start) % 4 + 4) % 4 < 0.01);
  }
}
/* Safety net: a live note that no held key, drone or lead owns and that has no scheduled end
   is an orphan (a lost release) — release it so nothing can ring forever. */
function sweepOrphans(now) {
  if (!R.live) return;
  const owned = new Set();
  for (const h of R.held.values()) for (const v of h.voices || []) owned.add(v);
  if (R.drone) for (const v of R.drone.voices) owned.add(v);
  if (R.lead) owned.add(R.lead);
  for (const v of R.live.voices) {
    if (v.offAt != null || v.ended || v.offDone || owned.has(v)) continue;
    if (now - v.start > 0.08) liveOff(v, now);
  }
}
function tick() {
  if (!Engine.running()) { if (Engine.ready) R.lastB = Tr.beatNow(); return; }
  const now = Engine.now(), bNow = Tr.beatAt(now);
  sweepOrphans(now);
  if (R.lastB < bNow) R.lastB = bNow;
  const b1 = Tr.beatAt(now + 0.12), b0 = R.lastB;
  if (R.countIn && bNow >= R.countIn.end - 0.02) beginRecording();
  if (R.rec && R.rec.active && R.rec.stopAt != null && bNow >= R.rec.stopAt) stopRecording(R.rec.stopAt);
  if (b1 > b0) {
    schedClicks(b0, b1); schedArp(b0, b1); schedRepeat(b0, b1); schedSeq(b0, b1); schedDL(b0, b1); schedLooper(b0, b1); schedHiro(bNow);
    R.lastB = b1;
  }
}

/* ===== Ear trainer ===== */
function earAsk() {
  const E = R.ear;
  if (E.answered || E.deg == null) { E.deg = Math.floor(Math.random() * 7); E.answered = false; E.msg = 'どの和音？キーで答える'; }
  const ch = buildChord({ keyPc: S.keyPc, scale: curScale(), deg: E.deg, dir: 'C', joyMode: 'DEFAULT', globalOct: S.globalOct });
  const t = Engine.now() + 0.02; allNotes(ch).forEach(n => { const v = R.live.noteOn(n, 0.8, t); R.live.noteOff(v, t + 1.4); });
  render();
}
function earAnswer(i) {
  const E = R.ear;
  const ch = chordFor(i, 'C'); const t = Engine.now(); allNotes(ch).forEach(n => { const v = R.live.noteOn(n, 0.8, t); R.live.noteOff(v, t + 0.9); });
  if (E.answered || E.deg == null) { render(); return; }
  E.total++; E.answered = true;
  const right = buildChord({ keyPc: S.keyPc, scale: curScale(), deg: E.deg, dir: 'C', joyMode: 'DEFAULT' });
  E.lastOk = i === E.deg;
  if (i === E.deg) { E.ok++; E.msg = '正解！ ' + right.roman + ' = ' + right.name; }
  else E.msg = '正解は ' + right.roman + '（' + right.name + '）';
  render();
}

/* ===== Chord Hero ===== */
function hiroToggle() {
  if (R.hiro && R.hiro.running) { R.hiro.running = false; R.hiro.msg = '停止'; render(); return; }
  const prog = []; while (prog.length < 16) prog.push(...PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]);
  const start = Math.ceil(Tr.beatNow() + 0.1) + 4;
  R.hiro = { running: true, start, prog, judged: new Array(16).fill(null), score: 0, msg: 'カウント…', last: '' };
  render();
}
function hiroJudge(i) {
  const H = R.hiro; if (!H || !H.running) return;
  const b = Tr.beatNow(), j = Math.round((b - H.start) / 4);
  if (j < 0 || j >= 16 || H.judged[j]) return;
  const off = b - (H.start + 4 * j);
  if (Math.abs(off) > 1.2) return;
  if (i !== H.prog[j]) { H.judged[j] = 'MISS'; H.last = 'MISS'; }
  else if (Math.abs(off) < 0.25) { H.judged[j] = 'PERFECT'; H.score += 2; H.last = 'PERFECT'; }
  else { H.judged[j] = 'GOOD'; H.score += 1; H.last = 'GOOD'; }
}
function schedHiro(bNow) {
  const H = R.hiro; if (!H || !H.running) return;
  for (let j = 0; j < 16; j++) if (!H.judged[j] && bNow > H.start + 4 * j + 1.2) { H.judged[j] = 'MISS'; H.last = 'MISS'; }
  if (bNow > H.start + 64) { H.running = false; H.msg = 'SCORE ' + Math.round(H.score / 32 * 100) + '%'; }
}

/* ===== MIDI out (optional, where the browser allows it) ===== */
function initMidi() {
  if (!navigator.requestMIDIAccess) { S.midiOut = false; toast('MIDI NOT SUPPORTED'); return; }
  navigator.requestMIDIAccess().then(a => { R.midi = a; toast('MIDI OUT ON'); }).catch(() => { S.midiOut = false; toast('MIDI BLOCKED'); render(); });
}
function midiSend(st, note, vel, time) {
  if (!S.midiOut || !R.midi) return;
  const ts = performance.now() + Math.max(0, ((time || 0) - Engine.now()) * 1000);
  try { R.midi.outputs.forEach(o => o.send([st, note & 127, vel & 127], ts)); } catch (e) {}
}

/* ===== User sample (file import; mic is intentionally not used) ===== */
function loadUserSample(file) {
  startAudio();
  file.arrayBuffer().then(ab => Engine.loadSample(ab)).then(root => {
    R.userLoaded = true;
    S.patch.sound = 'user'; S.patch.env = 'SUSTAIN'; R.live.applyPatch(S.patch);
    const m = Math.round(69 + 12 * Math.log2(root / 440));
    toast('SAMPLE ROOT ' + NOTE_NAMES[((m % 12) + 12) % 12] + Math.floor(m / 12 - 1)); save();
  }).catch(() => toast('CANNOT READ FILE'));
}
