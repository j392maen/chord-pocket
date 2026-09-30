const fs = require('fs'), vm = require('vm');
const ctx = { window: {}, navigator: {}, performance: { now: () => 0 }, console, queueMicrotask: f => f(), setTimeout: () => 0, setInterval: () => 0 };
vm.createContext(ctx);
for (const f of ['theory.js', 'audio.js', 'native.js']) vm.runInContext(fs.readFileSync('../src/' + f, 'utf8').replace(/^const /gm, 'var ').replace(/^class (\w+)/gm, 'var $1 = class $1'), ctx);
const base = { sound: 'epiano', env: 'TOUCH', attackMs: null, releaseMs: null, level: 1, fx: { reverb: 0.25, delay: 0.2, delayRate: '1/8', chorus: 0.3, flanger: 0, tremolo: 0, tremRate: 5, vibrato: 0.2, cutoff: 20000, glide: 0.2, stereo: 0.3, voices: 2 } };
const lines = [];
for (const s of ctx.SOUNDS) {
  const p = JSON.parse(JSON.stringify(base)); p.sound = s.id; p.env = s.env;
  const r = ctx.resolvePatch(p);
  const arr = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push(a[i] == null ? 0 : a[i]); return o; };
  lines.push([s.id, r.eng, r.wave, r.kind, r.waves.length, ...arr(r.waves, 3), ...arr(r.det, 3), ...arr(r.mix, 3), r.lp, r.fenv, r.lfoFilt, r.breath, r.cut, r.oct, r.formant.length, ...arr(r.formant, 3),
    r.ratio, r.index, r.idxDecay, r.idxAttack, r.idxPeak, r.tine, r.ratio2, r.a, r.d, r.s, r.r, r.level, r.reverb, r.delay, r.chorus, r.flanger, r.tremolo, r.tremRate, r.vibrato, r.cutoff, r.glide, r.stereo, r.voices].join(' '));
}
fs.writeFileSync('patches.txt', lines.join('\n') + '\n');
console.log(lines.length, 'patches');
