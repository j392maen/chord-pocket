/* ===== Native engine proxy (iOS app) =====
   Same interface as AudioSys, but every sound is produced by the C engine in the app process,
   so the app's AVAudioSession (.playback + .mixWithOthers) applies: it keeps YouTube Music
   playing and ignores the silent switch. Messages are batched once per microtask. */
const ENG_ID = { analog: 0, fm: 1, render: 2, sample: 3, pad: 4 };
const WAVE_ID = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
const KIND_ID = { piano: 0, harp: 1, guitar: 2, vibes: 3, shutter: 4 };
function resolvePatch(p) {
  const s = SOUND_BY_ID[p.sound] || SOUNDS[0];
  const e = Object.assign({}, ADSR_PRESETS[p.env] || ADSR_PRESETS.LONG);
  if (p.attackMs != null) e.a = p.attackMs / 1000;
  if (p.releaseMs != null) e.r = p.releaseMs / 1000;
  const f = p.fx;
  return {
    eng: ENG_ID[s.eng], wave: WAVE_ID[s.wave] || 0, kind: KIND_ID[s.kind] || 0,
    waves: (s.waves || []).map(w => WAVE_ID[w]), det: s.det || [], mix: s.mix || [],
    lp: s.lp || 0, fenv: s.fenv || 0, lfoFilt: s.lfoFilt || 0, breath: s.breath || 0, cut: s.cut || 1, oct: s.oct || 0,
    formant: s.formant || [], ratio: s.ratio || 1, index: s.index || 0, idxDecay: s.idxDecay || 0, idxAttack: s.idxAttack || 0,
    idxPeak: s.idxPeak || 0, tine: s.tine || 0, ratio2: s.ratio2 || 0,
    a: e.a, d: e.d, s: e.s, r: e.r, level: p.level == null ? 1 : p.level,
    reverb: f.reverb, delay: f.delay, chorus: f.chorus, flanger: f.flanger, tremolo: f.tremolo, tremRate: f.tremRate,
    vibrato: f.vibrato, cutoff: f.cutoff, glide: f.glide, stereo: f.stereo, voices: f.voices || 1,
  };
}
const NativeEngine = {
  isNative: true, ready: false, _q: [], _flushQ: false, _off: null, _bestRtt: 1e9, _vid: 0, _slots: new Array(16).fill(false),
  _scope: null, _scopeAsk: 0, sessionType: 'ambient',
  _post(m) { try { window.webkit.messageHandlers.cp.postMessage(m); } catch (e) {} },
  _send(m) { this._q.push(m); if (!this._flushQ) { this._flushQ = true; queueMicrotask(() => this._flush()); } },
  _flush() { this._flushQ = false; if (!this._q.length) return; const b = this._q; this._q = []; this._post({ op: 'batch', m: b }); },
  ensure() {
    if (this.ready) return;
    this.ready = true;
    this._post({ op: 'start' });
    this._sync(); setTimeout(() => this._sync(), 150); setTimeout(() => this._sync(), 400);
    setInterval(() => this._sync(), 3000);
    setInterval(() => { if (performance.now() - this._scopeAsk < 500) this._post({ op: 'scope' }); }, 50);
  },
  _sync() { this._post({ op: 'ping', p: performance.now() }); },
  _pong(p, host) { // called by native with the host clock (CACurrentMediaTime) at reply time
    const now = performance.now(), rtt = now - p;
    if (rtt <= this._bestRtt * 1.5 || this._off == null) { this._bestRtt = Math.min(this._bestRtt, rtt); this._off = host - (p + rtt / 2) / 1000; }
  },
  _scopeIn(arr) { this._scope = arr; },
  now() { return this._off == null ? performance.now() / 1000 : performance.now() / 1000 + this._off; },
  running() { return this.ready && this._off != null; },
  resume() {},
  setSession() {},
  setVolume(v) { this._send({ op: 'vol', v }); },
  setDelayTime(s) { this._send({ op: 'dtime', v: s }); },
  click(t, accent) { this._send({ op: 'click', t, a: accent ? 1 : 0 }); },
  haptic(k) { this._post({ op: 'haptic', k }); },
  prerender(kind, midis) { this._send({ op: 'prerender', kind: KIND_ID[kind], m: midis }); },
  scope() { this._scopeAsk = performance.now(); return this._scope; },
  _slot() { const i = this._slots.indexOf(false); if (i < 0) return 15; this._slots[i] = true; return i; },
  newChannel(patch) { return new NChannel(patch); },
  newDrums() { return new NDrums(); },
  loadSample(ab) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new AC(1, 1, 44100);
    return new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)).then(buf => {
      let d = buf.getChannelData(0); const max = Math.min(d.length, Math.floor(buf.sampleRate * 8)); d = d.slice(0, max);
      const root = detectPitchData(d, buf.sampleRate);
      const bytes = new Uint8Array(d.buffer); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      this._post({ op: 'sample', sr: buf.sampleRate, root, data: btoa(bin) });
      return root;
    });
  },
};
class NChannel {
  constructor(patch) { this.ch = NativeEngine._slot(); this.voices = new Set(); this.applyPatch(patch); this.setGate(1); }
  applyPatch(p) { this.patch = JSON.parse(JSON.stringify(p)); NativeEngine._send({ op: 'patch', ch: this.ch, p: resolvePatch(p) }); }
  env() { const e = Object.assign({}, ADSR_PRESETS[this.patch.env] || ADSR_PRESETS.LONG); if (this.patch.attackMs != null) e.a = this.patch.attackMs / 1000; if (this.patch.releaseMs != null) e.r = this.patch.releaseMs / 1000; return e; }
  noteOn(midi, vel, time, opts) {
    const now = NativeEngine.now(), t = Math.max(time || 0, now), e = this.env(), id = ++NativeEngine._vid;
    const v = { id, midi, start: t, offAt: null, env: e, ended: false };
    if (e.s <= 0) { v.offAt = t + e.a + e.d * 3 + 0.1; v.ended = true; setTimeout(() => this.voices.delete(v), (v.offAt - now + 0.2) * 1000); }
    NativeEngine._send({ op: 'on', ch: this.ch, id, m: midi, v: vel == null ? 0.8 : vel, t: time ? t : 0, g: opts && opts.glideFrom != null ? opts.glideFrom : -1 });
    this.voices.add(v); return v;
  }
  noteOff(v, time) {
    if (!v || v.offSent) return; v.offSent = true;
    const now = NativeEngine.now(), t = Math.max(time || 0, now);
    if (!v.ended) v.offAt = t;
    NativeEngine._send({ op: 'off', id: v.id, t: time && time > now + 0.002 ? t : 0 });
    setTimeout(() => this.voices.delete(v), (t - now + (v.env.r || 0.3) * 1.5 + 0.1) * 1000);
  }
  glideTo(v, midi, time) { v.midi = midi; NativeEngine._send({ op: 'glide', id: v.id, m: midi, t: 0 }); }
  setGate(g) { NativeEngine._send({ op: 'gate', ch: this.ch, v: g }); }
  allOff(t) { for (const v of this.voices) this.noteOff(v, t); }
  kill() { NativeEngine._send({ op: 'kill', ch: this.ch }); this.voices.clear(); }
  dispose() { this.kill(); const ch = this.ch; setTimeout(() => { NativeEngine._slots[ch] = false; }, 400); }
}
class NDrums {
  constructor() { this.ch = NativeEngine._slot(); this.kit = 0; this.voices = new Set(); this.setGate(1); }
  hit(i, time, vel, kit) { const now = NativeEngine.now(); NativeEngine._send({ op: 'drum', ch: this.ch, i, v: vel == null ? 1 : vel, k: kit == null ? this.kit : kit, t: time > now + 0.002 ? time : 0 }); }
  setGate(g) { NativeEngine._send({ op: 'gate', ch: this.ch, v: g * 1 }); }
  kill() { NativeEngine._send({ op: 'kill', ch: this.ch }); }
  dispose() { this.kill(); NativeEngine._slots[this.ch] = false; }
}
