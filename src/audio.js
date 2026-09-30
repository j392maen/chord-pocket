/* ===== Audio engine (plain Web Audio API; no <audio> elements, no Media Session) ===== */
const AudioSys = {
  ctx: null, master: null, limiter: null, reverbIn: null, delayIn: null, delayNode: null, delayFb: null,
  noise: null, sessionType: 'ambient',
  applySession(type) {
    this.sessionType = type;
    // W3C Audio Session API (Safari). 'ambient' mixes with other apps (YouTube Music keeps playing).
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {}
  },
  ensure() {
    if (!this.ctx) {
      this.applySession(this.sessionType);        // must be set BEFORE the context starts
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
    return this.ctx;
  },
  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2;
    this.master.connect(this.limiter); this.limiter.connect(ctx.destination);
    // reverb bus
    this.reverbIn = ctx.createGain();
    const conv = ctx.createConvolver(); conv.buffer = this.makeIR(2.8, 2.2);
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.9;
    this.reverbIn.connect(conv); conv.connect(rvOut); rvOut.connect(this.master);
    // delay bus (tempo synced)
    this.delayIn = ctx.createGain();
    this.delayNode = ctx.createDelay(4); this.delayNode.delayTime.value = 0.25;
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
    const dFilt = ctx.createBiquadFilter(); dFilt.type = 'lowpass'; dFilt.frequency.value = 3500;
    this.delayIn.connect(this.delayNode); this.delayNode.connect(dFilt); dFilt.connect(this.delayFb);
    this.delayFb.connect(this.delayNode); dFilt.connect(this.master); dFilt.connect(this.reverbIn);
    // shared noise
    const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  makeIR(sec, decay) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len; lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
    }
    return b;
  },
  setVolume(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); },
  setDelayTime(sec) { if (this.delayNode) this.delayNode.delayTime.setTargetAtTime(Math.min(3.9, sec), this.ctx.currentTime, 0.05); },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  get ready() { return !!this.ctx; },
  running() { return !!this.ctx && this.ctx.state === 'running'; },
  resume() { if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} } },
  setSession(type) { this.applySession(type); },
  isNative: false,
  click(time, accent) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175; g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(0.16, time + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g); g.connect(this.master); o.start(time); o.stop(time + 0.07);
  },
  scopeBuf: null,
  scope() {
    if (!this.ctx) return null;
    if (!this.analyser) { this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; this.limiter.connect(this.analyser); this.scopeBuf = new Float32Array(1024); }
    this.analyser.getFloatTimeDomainData(this.scopeBuf); return this.scopeBuf;
  },
  userSample: null, userRoot: 261.63,
  loadSample(ab) {
    return this.ctx.decodeAudioData(ab).then(buf => { this.userSample = buf; this.userRoot = detectPitchData(buf.getChannelData(0), buf.sampleRate); return this.userRoot; });
  },
  haptic(kind) { try { if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 18 : kind === 'medium' ? 10 : 5); } catch (e) {} },
  newChannel(patch) { return new Channel(patch); },
  newDrums() { return new DrumChannel(); },
  prerender(kind, midis) { prerender(kind, midis); },
};
function detectPitchData(d, sr) {
  const start = Math.floor(Math.min(d.length / 3, sr * 0.1)), N = Math.min(4096, d.length - start);
  if (N < 1024) return 261.63;
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(sr / 1200); lag < Math.min(N / 2, sr / 50); lag++) {
    let s = 0; for (let i = 0; i < N / 2; i++) s += d[start + i] * d[start + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return bestLag ? sr / bestLag : 261.63;
}

/* ---------- Envelope presets ---------- */
const ADSR_PRESETS = {
  LONG:    { a: 0.02,  d: 0.4, s: 0.8, r: 1.2 },
  SHORT:   { a: 0.005, d: 0.2, s: 0.6, r: 0.15 },
  SWELL:   { a: 0.9,   d: 0.3, s: 0.9, r: 1.6 },
  PLUCK:   { a: 0.002, d: 0.5, s: 0.0, r: 0.25 },
  TOUCH:   { a: 0.012, d: 0.6, s: 0.5, r: 0.45 },
  SUSTAIN: { a: 0.006, d: 0.1, s: 1.0, r: 0.35 },
};

/* ---------- Sound catalogue (all synthesized) ---------- */
const SOUNDS = [
  { id:'sine',   name:'SINE',        jp:'サイン',         eng:'analog', wave:'sine',     env:'LONG' },
  { id:'tri',    name:'TRIANGLE',    jp:'三角波',         eng:'analog', wave:'triangle', env:'LONG' },
  { id:'saw',    name:'SAW',         jp:'ノコギリ波',     eng:'analog', wave:'sawtooth', env:'LONG', cut:0.55 },
  { id:'square', name:'SQUARE',      jp:'矩形波',         eng:'analog', wave:'square',   env:'LONG', cut:0.5 },
  { id:'epiano', name:'FM E.PIANO',  jp:'FMエレピ',       eng:'fm', ratio:1,   index:2.2, idxDecay:0.9, tine:14, env:'TOUCH' },
  { id:'bell',   name:'FM BELL',     jp:'FMベル',         eng:'fm', ratio:3.5, index:3.0, idxDecay:2.2, env:'PLUCK', rel:2.5 },
  { id:'hx7',    name:'FM HX7',      jp:'FMブラス',       eng:'fm', ratio:1,   index:1.2, idxAttack:0.12, idxPeak:4, env:'SUSTAIN' },
  { id:'wurli',  name:'WURLI',       jp:'ウーリー',       eng:'fm', ratio:1,   index:1.4, idxDecay:0.5, ratio2:3, env:'TOUCH' },
  { id:'piano',  name:'PIANO',       jp:'ピアノ',         eng:'render', kind:'piano',  env:'SUSTAIN' },
  { id:'harp',   name:'HARP',        jp:'ハープ',         eng:'render', kind:'harp',   env:'SUSTAIN' },
  { id:'guitar', name:'AC.GUITAR',   jp:'アコギ',         eng:'render', kind:'guitar', env:'SUSTAIN' },
  { id:'vibes',  name:'VIBRAPHONE',  jp:'ビブラフォン',   eng:'render', kind:'vibes',  env:'SUSTAIN' },
  { id:'shutter',name:'SHUTTER',     jp:'シャッター',     eng:'render', kind:'shutter',env:'SUSTAIN' },
  { id:'strings',name:'STRINGS',     jp:'ストリングス',   eng:'pad', waves:['sawtooth','sawtooth','sawtooth'], det:[-9,0,8], lp:2600, env:'SWELL' },
  { id:'brass',  name:'BRASS',       jp:'ブラス',         eng:'pad', waves:['sawtooth','sawtooth'], det:[-5,5], lp:900, fenv:3200, env:'SUSTAIN' },
  { id:'flute',  name:'FLUTE',       jp:'フルート',       eng:'pad', waves:['sine','triangle'], det:[0,2], mix:[1,0.25], breath:0.12, lp:5000, env:'LONG' },
  { id:'clar',   name:'CLARINET',    jp:'クラリネット',   eng:'pad', waves:['square'], det:[0], lp:1600, env:'LONG' },
  { id:'vox',    name:'VOX AHH',     jp:'クワイア',       eng:'pad', waves:['sawtooth','sawtooth'], det:[-7,7], formant:[800,1150,2900], env:'SWELL' },
  { id:'juno',   name:'JUNO POLY',   jp:'ポリシンセ',     eng:'pad', waves:['sawtooth','square'], det:[-6,6], lp:2200, env:'LONG' },
  { id:'ocean',  name:'OCEAN PAD',   jp:'オーシャンパッド', eng:'pad', waves:['sawtooth','sawtooth','triangle'], det:[-14,14,0], lp:1200, lfoFilt:0.15, breath:0.05, env:'SWELL' },
  { id:'hum',    name:'HUMMING',     jp:'ハミング',       eng:'pad', waves:['triangle'], det:[0], formant:[300,600], env:'LONG' },
  { id:'robbo',  name:'ROBBO BASS',  jp:'シンセベース',   eng:'pad', waves:['square','sawtooth'], det:[0,3], lp:700, oct:-1, fenv:1600, env:'SHORT' },
  { id:'user',   name:'USER SAMPLE', jp:'ユーザー音源',   eng:'sample', env:'SUSTAIN' },
];
const SOUND_BY_ID = Object.fromEntries(SOUNDS.map(s => [s.id, s]));

/* ---------- Pre-rendered decaying instruments (cached per note) ---------- */
const RenderCache = new Map();
function renderNote(kind, midi) {
  const key = kind + ':' + midi;
  if (RenderCache.has(key)) return RenderCache.get(key);
  const ctx = AudioSys.ctx, sr = ctx.sampleRate, f = midiToHz(midi);
  let dur = kind === 'shutter' ? 0.6 : kind === 'vibes' ? 3.5 : kind === 'piano' ? Math.max(1.6, 4.5 - (midi - 48) * 0.05) : 3.0;
  const len = Math.floor(sr * dur), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  if (kind === 'piano' || kind === 'vibes') {
    const partials = kind === 'piano'
      ? Array.from({ length: 12 }, (_, i) => { const n = i + 1; return { n, a: 1 / Math.pow(n, 1.1) * (n === 1 ? 1 : 0.8), dec: 0.9 + n * 0.9 }; })
      : [{ n: 1, a: 1, dec: 0.6 }, { n: 3.98, a: 0.35, dec: 2.4 }, { n: 9.87, a: 0.12, dec: 5 }];
    const B = kind === 'piano' ? 0.00035 : 0;
    const kd = kind === 'piano' ? (1 + Math.max(0, midi - 60) * 0.03) : 1;
    for (const p of partials) {
      const fr = f * p.n * Math.sqrt(1 + B * p.n * p.n);
      if (fr > sr * 0.45) continue;
      const w = 2 * Math.PI * fr / sr, ph = Math.random() * 6.28;
      for (let i = 0; i < len; i++) d[i] += p.a * Math.sin(w * i + ph) * Math.exp(-p.dec * kd * i / sr);
    }
    if (kind === 'piano') { // hammer
      for (let i = 0; i < sr * 0.015; i++) d[i] += (Math.random() * 2 - 1) * 0.25 * (1 - i / (sr * 0.015));
    }
  } else { // Karplus–Strong family
    const period = sr / f, N = Math.max(2, Math.floor(period)), frac = period - N;
    const line = new Float32Array(N + 2);
    const bright = kind === 'harp' ? 0.9 : kind === 'shutter' ? 0.2 : 0.65;
    const damp = kind === 'shutter' ? 0.985 : kind === 'harp' ? 0.9985 : 0.9965;
    let lp = 0;
    for (let i = 0; i < line.length; i++) { const r = Math.random() * 2 - 1; lp = lp * (1 - bright) + r * bright; line[i] = lp; }
    let idx = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const a = line[idx], b = line[(idx + 1) % N];
      const out = a * (1 - frac * 0.5) + b * (frac * 0.5);
      d[i] = out;
      line[idx] = damp * 0.5 * (out + prev); prev = out;
      idx = (idx + 1) % N;
    }
    if (kind === 'guitar') { // simple body resonance: one-pole + short comb
      let y = 0; const dly = Math.floor(sr * 0.0021);
      for (let i = len - 1; i >= dly; i--) d[i] += d[i - dly] * 0.25;
      for (let i = 0; i < len; i++) { y = y * 0.35 + d[i] * 0.65; d[i] = y; }
    }
  }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = peak > 0 ? 0.6 / peak : 1;
  for (let i = 0; i < len; i++) d[i] *= g;
  for (let i = len - Math.floor(sr * 0.05); i < len; i++) d[i] *= (len - i) / (sr * 0.05);
  RenderCache.set(key, buf);
  return buf;
}
function prerender(kind, midis) {
  const list = midis.slice(); let i = 0;
  const step = () => { const t0 = performance.now(); while (i < list.length && performance.now() - t0 < 12) renderNote(kind, list[i++]); if (i < list.length) setTimeout(step, 16); };
  setTimeout(step, 30);
}

/* ---------- Channel: voice generator + insert FX + sends ---------- */
class Channel {
  constructor(patch) {
    const out = null;
    const ctx = AudioSys.ctx;
    this.patch = JSON.parse(JSON.stringify(patch));
    this.input = ctx.createGain();
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 0.8;
    this.trem = ctx.createGain();
    this.tremLfo = ctx.createOscillator(); this.tremDepth = ctx.createGain();
    this.tremLfo.connect(this.tremDepth); this.tremDepth.connect(this.trem.gain); this.tremLfo.start();
    // chorus: 2 modulated delays
    this.dry = ctx.createGain(); this.chorusWet = ctx.createGain(); this.flangeWet = ctx.createGain();
    this.chDelays = [0, 1].map(k => {
      const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.018 + k * 0.007;
      const l = ctx.createOscillator(); l.frequency.value = 0.6 + k * 0.37; const lg = ctx.createGain(); lg.gain.value = 0.004;
      l.connect(lg); lg.connect(dl.delayTime); l.start();
      const pan = ctx.createStereoPanner(); pan.pan.value = k ? 0.7 : -0.7;
      this.filter.connect(dl); dl.connect(pan); pan.connect(this.chorusWet);
      return dl;
    });
    // flanger
    this.flDelay = ctx.createDelay(0.02); this.flDelay.delayTime.value = 0.003;
    const fl = ctx.createOscillator(); fl.frequency.value = 0.25; const flg = ctx.createGain(); flg.gain.value = 0.0025;
    fl.connect(flg); flg.connect(this.flDelay.delayTime); fl.start();
    this.flFb = ctx.createGain(); this.flFb.gain.value = 0.6;
    this.filter.connect(this.flDelay); this.flDelay.connect(this.flFb); this.flFb.connect(this.flDelay); this.flDelay.connect(this.flangeWet);
    this.input.connect(this.filter); this.filter.connect(this.dry);
    this.sum = ctx.createGain();
    this.dry.connect(this.sum); this.chorusWet.connect(this.sum); this.flangeWet.connect(this.sum);
    this.sum.connect(this.trem);
    this.out = ctx.createGain();
    this.gate = ctx.createGain(); // mixer mute/volume (also silences sends)
    this.trem.connect(this.gate); this.gate.connect(this.out);
    this.revSend = ctx.createGain(); this.dlySend = ctx.createGain();
    this.out.connect(this.revSend); this.out.connect(this.dlySend);
    this.revSend.connect(AudioSys.reverbIn); this.dlySend.connect(AudioSys.delayIn);
    this.out.connect(out || AudioSys.master);
    // vibrato LFO (cents)
    this.vibLfo = ctx.createOscillator(); this.vibLfo.frequency.value = 5.2; this.vibDepth = ctx.createGain();
    this.vibLfo.connect(this.vibDepth); this.vibLfo.start();
    this.voices = new Set(); this.panFlip = 0; this.monoVoice = null;
    this.applyPatch(this.patch);
  }
  applyPatch(p) {
    this.patch = JSON.parse(JSON.stringify(p));
    const t = AudioSys.now(), fx = p.fx;
    const snd = SOUND_BY_ID[p.sound] || SOUNDS[0];
    const cutBase = fx.cutoff * (snd.cut || 1);
    this.filter.frequency.setTargetAtTime(Math.max(40, Math.min(20000, cutBase)), t, 0.03);
    this.chorusWet.gain.setTargetAtTime(fx.chorus * 0.8, t, 0.03);
    this.flangeWet.gain.setTargetAtTime(fx.flanger * 0.7, t, 0.03);
    this.dry.gain.setTargetAtTime(1 - Math.max(fx.chorus, fx.flanger) * 0.35, t, 0.03);
    const tr = fx.tremolo;
    this.tremLfo.frequency.setTargetAtTime(fx.tremRate, t, 0.03);
    this.tremDepth.gain.setTargetAtTime(tr * 0.5, t, 0.03);
    this.trem.gain.setTargetAtTime(1 - tr * 0.5, t, 0.03);
    this.vibDepth.gain.setTargetAtTime(fx.vibrato * 40, t, 0.03);
    this.revSend.gain.setTargetAtTime(fx.reverb * 0.9, t, 0.03);
    this.dlySend.gain.setTargetAtTime(fx.delay * 0.7, t, 0.03);
    this.out.gain.setTargetAtTime(p.level == null ? 1 : p.level, t, 0.03);
  }
  setGate(g) { this.gate.gain.setTargetAtTime(g, AudioSys.now(), 0.02); }
  env() {
    const p = this.patch;
    const e = Object.assign({}, ADSR_PRESETS[p.env] || ADSR_PRESETS.LONG);
    if (p.attackMs != null) e.a = p.attackMs / 1000;
    if (p.releaseMs != null) e.r = p.releaseMs / 1000;
    return e;
  }
  /* start a note; returns voice handle */
  noteOn(midi, vel, time, opts) {
    const ctx = AudioSys.ctx; time = Math.max(time || 0, ctx.currentTime);
    const p = this.patch, snd = SOUND_BY_ID[p.sound] || SOUNDS[0], e = this.env();
    const amp = ctx.createGain(); amp.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const w = p.fx.stereo; this.panFlip = (this.panFlip + 1) % 4;
    pan.pan.value = w * [-0.9, 0.9, -0.4, 0.4][this.panFlip];
    amp.connect(pan); pan.connect(this.input);
    const v = { midi, amp, pan, srcs: [], extra: [], env: e, start: time, offAt: null, ended: false, freqParams: [] };
    const f = midiToHz(midi + (snd.oct ? 12 * snd.oct : 0));
    const peak = (vel == null ? 0.8 : vel) * 0.22;
    const addOsc = (type, freq, detune, gain, dest) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune || 0;
      this.vibDepth.connect(o.detune);
      const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest || amp);
      o.start(time); v.srcs.push(o); v.freqParams.push({ p: o.frequency, mul: freq / f }); return o;
    };
    if (snd.eng === 'analog') {
      const n = p.fx.voices || 1;
      for (let k = 0; k < n; k++) {
        const det = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * 12 * Math.min(1, n / 4);
        addOsc(snd.wave, f, det, 1 / Math.sqrt(n));
      }
    } else if (snd.eng === 'fm') {
      const car = addOsc('sine', f, 0, 1);
      const mod = ctx.createOscillator(); mod.frequency.value = f * snd.ratio; const mg = ctx.createGain();
      mod.connect(mg); mg.connect(car.frequency); mod.start(time); v.srcs.push(mod); v.freqParams.push({ p: mod.frequency, mul: snd.ratio });
      const I = snd.index * f;
      if (snd.idxAttack) { mg.gain.setValueAtTime(I * 0.3, time); mg.gain.linearRampToValueAtTime(snd.idxPeak * f * 0.5, time + snd.idxAttack); mg.gain.setTargetAtTime(I, time + snd.idxAttack, 0.3); }
      else { mg.gain.setValueAtTime(I, time); mg.gain.setTargetAtTime(I * 0.15, time, snd.idxDecay / 3); }
      if (snd.tine) { const t2 = addOsc('sine', f * snd.tine, 0, 0.08); const tg = t2; }
      if (snd.ratio2) addOsc('sine', f * snd.ratio2, 0, 0.12);
      if ((p.fx.voices || 1) > 1) addOsc('sine', f, 7, 0.5);
    } else if (snd.eng === 'render') {
      const s = ctx.createBufferSource(); s.buffer = renderNote(snd.kind, Math.round(midi));
      this.vibDepth.connect(s.detune);
      const g = ctx.createGain(); g.gain.value = snd.kind === 'shutter' ? 4 : 1.6; s.connect(g); g.connect(amp); s.start(time); v.srcs.push(s);
      v.freqParams.push({ p: s.playbackRate, rate: true });
    } else if (snd.eng === 'sample') {
      if (AudioSys.userSample) {
        const s = ctx.createBufferSource(); s.buffer = AudioSys.userSample;
        s.playbackRate.value = f / AudioSys.userRoot; this.vibDepth.connect(s.detune);
        const g = ctx.createGain(); g.gain.value = 1.4; s.connect(g); g.connect(amp); s.start(time); v.srcs.push(s);
      } else addOsc('triangle', f, 0, 1);
    } else { // pad engine
      let dest = amp;
      if (snd.formant) {
        const merge = ctx.createGain(); merge.gain.value = 1;
        snd.formant.forEach((ff, i) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 6; const g = ctx.createGain(); g.gain.value = [2.2, 1.4, 0.8][i] || 1; merge.connect(bp); bp.connect(g); g.connect(amp); v.extra.push(bp); });
        dest = merge;
      } else if (snd.lp) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
        const base = Math.min(12000, snd.lp * (1 + (midi - 60) / 60));
        lp.frequency.value = base;
        if (snd.fenv) { lp.frequency.setValueAtTime(base, time); lp.frequency.linearRampToValueAtTime(base + snd.fenv, time + 0.08); lp.frequency.setTargetAtTime(base, time + 0.08, 0.35); }
        if (snd.lfoFilt) { const l = ctx.createOscillator(); l.frequency.value = snd.lfoFilt; const lg = ctx.createGain(); lg.gain.value = base * 0.6; l.connect(lg); lg.connect(lp.frequency); l.start(time); v.srcs.push(l); }
        lp.connect(amp); dest = lp; v.extra.push(lp);
      }
      const uni = Math.max(1, Math.min(2, (p.fx.voices || 1) / 2));
      snd.waves.forEach((wv, i) => {
        for (let u = 0; u < uni; u++) addOsc(wv, f, snd.det[i] + (u ? 9 : 0), (snd.mix ? snd.mix[i] : 1) / snd.waves.length / uni, dest);
      });
      if (snd.breath) {
        const nz = ctx.createBufferSource(); nz.buffer = AudioSys.noise; nz.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
        const g = ctx.createGain(); g.gain.value = snd.breath; nz.connect(bp); bp.connect(g); g.connect(amp); nz.start(time); v.srcs.push(nz);
      }
    }
    // glide (portamento) from previous pitch
    if (opts && opts.glideFrom != null && p.fx.glide > 0) {
      const gt = p.fx.glide * 0.4, ratio = midiToHz(opts.glideFrom) / midiToHz(midi);
      for (const fp of v.freqParams) {
        const target = fp.p.value; fp.p.setValueAtTime(target * ratio, time); fp.p.exponentialRampToValueAtTime(target, time + gt);
      }
    }
    // ADSR
    const g = amp.gain;
    g.setValueAtTime(0, time);
    g.linearRampToValueAtTime(peak, time + Math.max(0.002, e.a));
    g.setTargetAtTime(peak * Math.max(0.0001, e.s), time + e.a, Math.max(0.01, e.d / 3));
    if (e.s === 0) { // pluck: auto end
      const endT = time + e.a + e.d * 3 + 0.1; v.offAt = endT; this._scheduleStop(v, endT + 0.05);
    }
    this.voices.add(v);
    return v;
  }
  /* legato pitch change for mono lead */
  glideTo(v, midi, time) {
    const snd = SOUND_BY_ID[this.patch.sound];
    const f = midiToHz(midi + (snd && snd.oct ? 12 * snd.oct : 0));
    const gt = Math.max(0.005, this.patch.fx.glide * 0.4);
    const ratio = midiToHz(midi) / midiToHz(v.midi);
    for (const fp of v.freqParams) {
      const cur = fp.p.value, tgt = cur * ratio;
      fp.p.cancelScheduledValues(time); fp.p.setValueAtTime(cur, time); fp.p.exponentialRampToValueAtTime(Math.max(0.01, tgt), time + gt);
    }
    v.midi = midi;
  }
  noteOff(v, time) {
    if (!v || v.ended) return;
    const ctx = AudioSys.ctx; time = Math.max(time || 0, ctx.currentTime);
    const r = Math.max(0.01, v.env.r);
    v.offAt = time;
    const g = v.amp.gain;
    if (g.cancelAndHoldAtTime) { try { g.cancelAndHoldAtTime(time); } catch (e) { g.cancelScheduledValues(time); } }
    else if (time <= ctx.currentTime + 0.005) { g.cancelScheduledValues(time); try { g.setValueAtTime(g.value, time); } catch (e) {} }
    else g.cancelScheduledValues(time);
    g.setTargetAtTime(0, time, r / 4);
    this._scheduleStop(v, time + r * 1.5 + 0.05);
  }
  _scheduleStop(v, t) {
    if (v.ended) return; v.ended = true;
    for (const s of v.srcs) { try { s.stop(t); } catch (e) {} }
    const last = v.srcs[0];
    const cleanup = () => { try { v.amp.disconnect(); v.pan.disconnect(); } catch (e) {} this.voices.delete(v); };
    if (last) last.onended = cleanup; else setTimeout(cleanup, (t - AudioSys.now()) * 1000 + 50);
  }
  allOff(time) { for (const v of Array.from(this.voices)) this.noteOff(v, time); }
  kill() { const t = AudioSys.now(); for (const v of Array.from(this.voices)) { v.amp.gain.cancelScheduledValues(t); v.amp.gain.setTargetAtTime(0, t, 0.01); this._scheduleStop(v, t + 0.06); } }
  dispose() { this.kill(); setTimeout(() => { try { this.out.disconnect(); this.revSend.disconnect(); this.dlySend.disconnect(); this.tremLfo.stop(); this.vibLfo.stop(); } catch (e) {} }, 200); }
}

/* ---------- Drum synth ---------- */
const DRUM_NAMES = ['KICK','SNARE','CLAP','HI-HAT','TOM','BELL','CYMBAL'];
const DRUM_KITS = [
  { name:'ACOUSTIC', pitch:1.0, decay:1.0, tone:0.5, hp:7000, bright:0.6 },
  { name:'808',      pitch:0.8, decay:2.2, tone:0.7, hp:8000, bright:0.5 },
  { name:'909',      pitch:1.1, decay:1.2, tone:0.4, hp:9000, bright:0.9 },
  { name:'LO-FI',    pitch:0.9, decay:0.8, tone:0.5, hp:4000, bright:0.3 },
  { name:'ELECTRO',  pitch:1.3, decay:0.6, tone:0.8, hp:10000, bright:1.0 },
  { name:'JAZZ',     pitch:1.2, decay:1.4, tone:0.3, hp:6000, bright:0.4 },
  { name:'TRASH',    pitch:0.7, decay:0.9, tone:0.6, hp:3000, bright:0.2 },
];
class DrumChannel {
  constructor() {
    const out = null;
    const ctx = AudioSys.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.rev = ctx.createGain(); this.rev.gain.value = 0.12;
    this.out.connect(out || AudioSys.master); this.out.connect(this.rev); this.rev.connect(AudioSys.reverbIn);
    this.kit = 0;
  }
  setGate(g) { this.out.gain.setTargetAtTime(g * 0.9, AudioSys.now(), 0.02); }
  hit(i, time, vel, kitIdx) {
    const ctx = AudioSys.ctx; time = Math.max(time, ctx.currentTime); vel = vel == null ? 1 : vel;
    const k = DRUM_KITS[kitIdx == null ? this.kit : kitIdx];
    const env = (g, peak, dec) => { g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(peak * vel, time + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, time + dec); };
    const noise = (dec, type, freq, q, peak) => {
      const s = ctx.createBufferSource(); s.buffer = AudioSys.noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = ctx.createGain(); env(g, peak, dec); s.connect(f); f.connect(g); g.connect(this.out); s.start(time, Math.random()); s.stop(time + dec + 0.05);
    };
    const tone = (f0, f1, dec, peak, type) => {
      const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, time); o.frequency.exponentialRampToValueAtTime(f1, time + dec * 0.6);
      const g = ctx.createGain(); env(g, peak, dec); o.connect(g); g.connect(this.out); o.start(time); o.stop(time + dec + 0.05);
    };
    switch (i) {
      case 0: tone(150 * k.pitch, 45 * k.pitch, 0.35 * k.decay, 1.0); noise(0.01, 'lowpass', 3000, 1, 0.3 * k.bright); break;
      case 1: tone(220 * k.pitch, 160 * k.pitch, 0.12 * k.decay, 0.5 * k.tone + 0.2, 'triangle'); noise(0.18 * k.decay, 'bandpass', 1800 * k.pitch, 0.8, 0.6); break;
      case 2: for (let r = 0; r < 3; r++) { const tt = time + r * 0.011; const s = ctx.createBufferSource(); s.buffer = AudioSys.noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 * k.pitch; f.Q.value = 1.2; const g = ctx.createGain(); const dec = r === 2 ? 0.2 * k.decay : 0.012; g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.7 * vel, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + dec); s.connect(f); f.connect(g); g.connect(this.out); s.start(tt, Math.random()); s.stop(tt + dec + 0.05); } break;
      case 3: noise(0.05 * k.decay, 'highpass', k.hp, 0.7, 0.35); break;
      case 4: tone(180 * k.pitch, 90 * k.pitch, 0.3 * k.decay, 0.7); break;
      case 5: [540, 800].forEach(fr => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * k.pitch; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * k.pitch; bp.Q.value = 3; const g = ctx.createGain(); env(g, 0.35, 0.25 * k.decay); o.connect(bp); bp.connect(g); g.connect(this.out); o.start(time); o.stop(time + 0.4 * k.decay); }); break;
      case 6: noise(1.1 * k.decay, 'highpass', k.hp * 0.8, 0.5, 0.35); break;
      case 7: noise(0.28 * k.decay, 'highpass', k.hp, 0.7, 0.3); break; // open hat
      case 8: noise(0.5, 'bandpass', 5200, 3, 0.18); tone(4200, 4000, 0.4, 0.04, 'triangle'); break; // ride
    }
  }
}
