/* ===== Menus ===== */
const pct = v => Math.round(v * 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cyc = (arr, cur, d) => arr[(arr.indexOf(cur) + d + arr.length * 4) % arr.length];
function fxItem(label, key, step) {
  return { label, get: () => String(pct(S.patch.fx[key])), inc: d => { S.patch.fx[key] = clamp(Math.round((S.patch.fx[key] + d * (step || 0.1)) * 100) / 100, 0, 1); patchChanged(); } };
}
function patchChanged() { if (R.live) R.live.applyPatch(S.patch); updateDelayTime(); save(); }
const CUTS = [20, 40, 80, 150, 250, 400, 600, 900, 1300, 2000, 3000, 4500, 7000, 10000, 14000, 20000];

const MENUS = {
  key: () => [
    { label: 'KEY', jp: 'キー', get: () => NOTE_NAMES[S.keyPc], inc: d => { S.keyPc = (S.keyPc + d + 12) % 12; save(); } },
    { label: 'SCALE', jp: 'スケール', get: () => curScale().name, sub: () => curScale().jp, inc: d => { S.scaleIdx = (S.scaleIdx + d + SCALES.length) % SCALES.length; save(); } },
    { label: 'OCTAVE', jp: '全体オクターブ', get: () => (S.globalOct > 0 ? '+' : '') + S.globalOct, inc: d => { S.globalOct = clamp(S.globalOct + d, -1, 2); save(); } },
    { label: 'JOYSTICK', jp: 'スティックモード', get: () => S.joyMode, inc: d => { S.joyMode = cyc(JOY_MODES, S.joyMode, d); save(); } },
    ...(Engine.isNative ? [] : [{ label: 'AUDIO', jp: '他アプリの音', get: () => S.session === 'ambient' ? 'MIX' : 'SOLO', sub: () => S.session === 'ambient' ? '裏の音楽と共存（消音スイッチで無音）' : '消音スイッチ無視・他アプリは停止', inc: () => { S.session = S.session === 'ambient' ? 'playback' : 'ambient'; Engine.setSession(S.session); save(); } }]),
    { label: 'BODY', jp: '本体カラー', get: () => BODY_COLORS[S.body || 0].name, inc: d => { S.body = ((S.body || 0) + d + BODY_COLORS.length) % BODY_COLORS.length; applyBody(); save(); } },
    ...(Engine.isNative ? [{ label: 'HAPTICS', jp: '触覚フィードバック', get: () => S.haptics === false ? 'OFF' : 'ON', inc: () => { S.haptics = S.haptics === false; save(); } }] : [{ label: 'MIDI OUT', jp: 'MIDI出力', get: () => S.midiOut ? 'ON' : 'OFF', inc: () => { S.midiOut = !S.midiOut; if (S.midiOut) initMidi(); save(); } }]),
    { label: 'GUIDE', jp: '操作ガイドを開く', get: () => 'OPEN', click: () => openHelp() },
    { label: 'TUTORIAL', jp: 'はじめのガイドをもう一度', get: () => 'START', click: () => { closeMenu(); R.onboard = 1; } },
  ],
  sound: () => [
    { label: 'SOUND', jp: '音色', get: () => SOUND_BY_ID[S.patch.sound].name, sub: () => SOUND_BY_ID[S.patch.sound].jp, inc: d => { const s = cyc(SOUNDS, SOUND_BY_ID[S.patch.sound], d); S.patch.sound = s.id; S.patch.env = s.env; S.patch.attackMs = null; S.patch.releaseMs = s.rel ? s.rel * 1000 : null; patchChanged(); warmSound(); } },
    { label: 'USER SAMPLE', jp: '音声ファイル', get: () => R.userLoaded ? 'LOADED' : 'OPEN FILE', click: () => document.getElementById('file').click() },
    fxItem('REVERB', 'reverb'), fxItem('DELAY', 'delay'),
    { label: 'DLY RATE', jp: 'ディレイ間隔', get: () => S.patch.fx.delayRate, inc: d => { S.patch.fx.delayRate = cyc(DELAY_RATES, S.patch.fx.delayRate, d); patchChanged(); } },
    fxItem('CHORUS', 'chorus'), fxItem('FLANGER', 'flanger'), fxItem('TREMOLO', 'tremolo'),
    { label: 'TREM RATE', jp: 'トレモロ速度', get: () => S.patch.fx.tremRate + 'Hz', inc: d => { S.patch.fx.tremRate = clamp(S.patch.fx.tremRate + d, 1, 16); patchChanged(); } },
    fxItem('VIBRATO', 'vibrato'),
    { label: 'FILTER', jp: 'カットオフ', get: () => fmtHz(S.patch.fx.cutoff), inc: d => { let i = CUTS.findIndex(c => c >= S.patch.fx.cutoff - 1); i = clamp((i < 0 ? CUTS.length - 1 : i) + d, 0, CUTS.length - 1); S.patch.fx.cutoff = CUTS[i]; patchChanged(); } },
    fxItem('GLIDE', 'glide'), fxItem('STEREO', 'stereo'),
    { label: 'VOICES', jp: 'ボイス数', bar: false, get: () => String(S.patch.fx.voices), inc: d => { S.patch.fx.voices = cyc([1, 2, 4, 8], S.patch.fx.voices, d); patchChanged(); } },
    { label: 'ADSR', jp: 'エンベロープ', get: () => S.patch.env, inc: d => { S.patch.env = cyc(Object.keys(ADSR_PRESETS), S.patch.env, d); S.patch.attackMs = null; S.patch.releaseMs = null; patchChanged(); } },
    { label: 'ATTACK', jp: 'アタック', get: () => Math.round(R.live ? R.live.env().a * 1000 : ADSR_PRESETS[S.patch.env].a * 1000) + 'ms', inc: d => { const cur = S.patch.attackMs != null ? S.patch.attackMs : ADSR_PRESETS[S.patch.env].a * 1000; S.patch.attackMs = clamp(Math.round(cur * (d > 0 ? 1.35 : 0.74)) || 1, 1, 2000); patchChanged(); } },
    { label: 'RELEASE', jp: 'リリース', get: () => Math.round(R.live ? R.live.env().r * 1000 : ADSR_PRESETS[S.patch.env].r * 1000) + 'ms', inc: d => { const cur = S.patch.releaseMs != null ? S.patch.releaseMs : ADSR_PRESETS[S.patch.env].r * 1000; S.patch.releaseMs = clamp(Math.round(cur * (d > 0 ? 1.35 : 0.74)) || 1, 1, 5000); patchChanged(); } },
    { label: 'BASS', jp: 'ベース', get: () => S.patch.fx.bassMode, inc: d => { S.patch.fx.bassMode = cyc(['OFF', 'ROOT', 'SLASH'], S.patch.fx.bassMode, d); save(); } },
    { label: 'VOICE LEAD', jp: 'ボイスリーディング', get: () => S.patch.fx.voiceLead ? 'ON' : 'OFF', inc: () => { S.patch.fx.voiceLead = !S.patch.fx.voiceLead; save(); } },
    { label: 'LEVEL', jp: '音色の音量', get: () => String(pct(S.patch.level)), inc: d => { S.patch.level = clamp(Math.round((S.patch.level + d * 0.1) * 10) / 10, 0, 1); patchChanged(); } },
  ],
  mode: () => {
    const m = S.mode, items = [
      { label: 'MODE', jp: 'モード', get: () => S.mode, sub: () => MODE_JP[S.mode], inc: d => setMode(cyc(MODES, S.mode, d)) },
      { label: 'TEMPO', jp: 'テンポ', get: () => S.bpm + ' BPM', inc: d => Tr.setBpm(S.bpm + d) },
      { label: 'TAP', jp: 'タップテンポ', get: () => '♩ TAP', click: () => tapTempo() },
    ];
    if (m === 'STRUM') items.push({ label: 'STRUM', jp: 'ストラム速度', get: () => S.strum, inc: d => { S.strum = cyc(['SLOW', 'MED', 'FAST'], S.strum, d); save(); } });
    if (m === 'ARP') items.push(
      { label: 'PATTERN', jp: 'アルペジオ型', get: () => S.arpPattern, inc: d => { S.arpPattern = cyc(ARP_PATTERNS, S.arpPattern, d); save(); } },
      { label: 'RATE', jp: '速さ', get: () => RATE_LABEL(S.arpRate), inc: d => { S.arpRate = cyc(RATE_KEYS, S.arpRate, d); save(); } },
      { label: 'LAYER', jp: '重ね方', get: () => S.arpLayer, inc: d => { S.arpLayer = cyc(ARP_LAYERS, S.arpLayer, d); save(); } });
    if (m === 'REPEAT') items.push({ label: 'RATE', jp: 'リピート速さ', get: () => RATE_LABEL(S.repeatRate), inc: d => { S.repeatRate = cyc(RATE_KEYS, S.repeatRate, d); save(); } });
    if (m === 'SEQ') items.push({ label: 'STEP LEN', jp: '1ステップの長さ', get: () => ({ '1拍': '1 BEAT', '2拍': '2 BEATS', '1小節': '1 BAR' })[S.seqStepLen], inc: d => { S.seqStepLen = cyc(Object.keys(SEQ_STEPLEN), S.seqStepLen, d); save(); } },
      { label: 'CLEAR', jp: 'ステップ全消去', get: () => 'CLEAR ALL', click: () => { S.seq.steps = [null, null, null, null]; R.seqCursor = 0; save(); toast('STEPS CLEARED'); } });
    if (m === 'DRUM' || m === 'DRUMLOOP') items.push({ label: 'KIT', jp: 'ドラムキット', get: () => DRUM_KITS[S.drumKit].name, inc: d => { S.drumKit = (S.drumKit + d + 7) % 7; if (R.drums) R.drums.kit = S.drumKit; save(); } });
    items.push(
      { label: 'LOOP BARS', jp: 'ルーパー小節数', get: () => S.loopBars ? S.loopBars + (S.loopBars > 1 ? ' BARS' : ' BAR') : 'FREE', inc: d => { S.loopBars = clamp(S.loopBars + d, 0, 8); save(); } },
      { label: 'METRONOME', jp: '録音中のクリック', get: () => S.metronome ? 'ON' : 'OFF', inc: () => { S.metronome = !S.metronome; save(); } });
    return items;
  },
  preset: () => [
    { label: 'LOAD', jp: 'プリセット読込', get: () => 'SLOT ' + (R.slot + 1) + (S.presets[R.slot] ? '' : ' EMPTY'), inc: d => { R.slot = (R.slot + d + 4) % 4; }, click: () => { const p = S.presets[R.slot]; if (!p) { toast('EMPTY SLOT'); return; } Object.assign(S, JSON.parse(JSON.stringify(p))); S.patch.fx = Object.assign(defaultState().patch.fx, S.patch.fx); patchChanged(); Tr.setBpm(S.bpm); toast('LOADED SLOT ' + (R.slot + 1)); } },
    { label: 'SAVE', jp: 'プリセット保存', get: () => 'SLOT ' + (R.slot + 1), inc: d => { R.slot = (R.slot + d + 4) % 4; }, click: () => { S.presets[R.slot] = { patch: JSON.parse(JSON.stringify(S.patch)), keyPc: S.keyPc, scaleIdx: S.scaleIdx, joyMode: S.joyMode, bpm: S.bpm, globalOct: S.globalOct, mode: S.mode, arpPattern: S.arpPattern, arpRate: S.arpRate, arpLayer: S.arpLayer, strum: S.strum, repeatRate: S.repeatRate }; save(); toast('SAVED SLOT ' + (R.slot + 1)); } },
    { label: 'RESET', jp: '初期化（ルーパー・設定）', get: () => R.resetArm ? 'TAP AGAIN' : 'TAP TWICE', click: () => { if (!R.resetArm) { R.resetArm = true; return; } R.resetArm = false; clearAll(); const pr = S.presets; S = defaultState(); S.presets = pr; patchChanged(); Tr.setBpm(S.bpm); toast('RESET DONE'); } },
  ],
};
R.slot = 0;
function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'kHz' : v + 'Hz'; }
function menuItems() { return R.menu ? MENUS[R.menu]() : []; }
function openMenu(name) { R.menu = name; R.resetArm = false; const n = menuItems().length; R.menuIdx[name] = clamp(R.menuIdx[name] || 0, 0, n - 1); render(); }
function closeMenu() { if (R.menu) { R.menu = null; render(); } }
function menuNav(d) { Engine.haptic('selection'); const n = menuItems().length; R.menuIdx[R.menu] = (R.menuIdx[R.menu] + d + n) % n; R.resetArm = false; render(); }
function menuVal(d) { Engine.haptic('selection'); const it = menuItems()[R.menuIdx[R.menu]]; if (it && it.inc) it.inc(d); else if (it && it.click && d > 0) it.click(); render(); }
function menuClick() {
  const it = menuItems()[R.menuIdx[R.menu]];
  if (it && it.click) { it.click(); render(); return; }
  randomize(R.menu); render();
}
function randomize(which) {
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  if (which === 'key') { S.keyPc = Math.floor(Math.random() * 12); toast('RANDOM KEY ' + NOTE_NAMES[S.keyPc]); }
  if (which === 'sound') {
    const s = rnd(SOUNDS.filter(x => x.id !== 'user')); S.patch.sound = s.id; S.patch.env = s.env; S.patch.attackMs = null; S.patch.releaseMs = null;
    const f = S.patch.fx; f.reverb = Math.round(Math.random() * 6) / 10; f.delay = Math.random() < 0.4 ? Math.round(Math.random() * 5) / 10 : 0; f.delayRate = rnd(DELAY_RATES);
    f.chorus = Math.random() < 0.4 ? 0.5 : 0; f.flanger = Math.random() < 0.15 ? 0.5 : 0; f.tremolo = Math.random() < 0.2 ? 0.4 : 0; f.vibrato = Math.random() < 0.2 ? 0.3 : 0;
    f.stereo = Math.round(Math.random() * 10) / 10; patchChanged(); warmSound(); toast('RANDOM ' + s.name);
  }
  if (which === 'mode') {
    if (S.mode === 'ARP') { S.arpPattern = rnd(ARP_PATTERNS); S.arpRate = rnd(RATE_KEYS); toast(S.arpPattern + ' ' + RATE_LABEL(S.arpRate)); }
    else if (S.mode === 'REPEAT') { S.repeatRate = rnd(RATE_KEYS); toast('REPEAT ' + RATE_LABEL(S.repeatRate)); }
    else { S.drumKit = Math.floor(Math.random() * 7); toast('KIT ' + DRUM_KITS[S.drumKit].name); }
  }
  save();
}
function tapTempo() {
  const t = performance.now(); R.taps = R.taps.filter(x => t - x < 2500); R.taps.push(t);
  if (R.taps.length >= 3) { const iv = []; for (let i = 1; i < R.taps.length; i++) iv.push(R.taps[i] - R.taps[i - 1]); const avg = iv.reduce((a, b) => a + b, 0) / iv.length; Tr.setBpm(60000 / avg); toast('TAP ' + S.bpm + ' BPM'); }
  else toast('TAP ×' + R.taps.length);
}
function setMode(m) {
  const old = S.mode; if (old === m) return;
  if (old === 'SEQ' && R.seqPlay) { autoBounce('SEQ'); R.seqPlay = null; }
  if (old === 'DRUMLOOP' && R.dl) { autoBounce('DRUMLOOP'); R.dl = null; }
  if (old === 'HIRO') R.hiro = null;
  stopDrone(); R.arp = null; R.rep = null;
  for (const h of R.held.values()) releaseVoices(h);
  if (R.lead) { liveOff(R.lead, Engine.now()); R.lead = null; }
  S.mode = m; save(); render();
}
function toast(msg) { R.toast = { msg, until: performance.now() + 1500 }; }
const BODY_COLORS = [
  { name: 'SPRUCE', v: ['#34453f', '#23302c', '#18211e', '#465a53'] },
  { name: 'CHALK',  v: ['#d9d6cc', '#c3c0b5', '#a9a69b', '#eeebe2'] },
  { name: 'INK',    v: ['#2a2d3a', '#1d1f29', '#13141b', '#3a3e50'] },
  { name: 'CORAL',  v: ['#d9644f', '#c0503d', '#9c3d2e', '#ea7d68'] },
  { name: 'LILAC',  v: ['#a99fc4', '#9086b0', '#766c95', '#bdb4d6'] },
];
function applyBody() {
  const c = BODY_COLORS[S.body || 0].v, st = document.documentElement.style;
  st.setProperty('--body', c[0]); st.setProperty('--body-lo', c[1]); st.setProperty('--body-deep', c[2]); st.setProperty('--body-hi', c[3]);
  document.documentElement.dataset.body = BODY_COLORS[S.body || 0].name.toLowerCase();
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = c[1];
}

