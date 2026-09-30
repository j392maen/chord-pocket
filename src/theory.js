/* ===== Theory: scales, chord types, joystick mapping, voicing ===== */
const NOTE_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const ROMAN = ['I','II','III','IV','V','VI','VII'];

const SCALES = [
  { id:'major',   name:'MAJOR',       jp:'メジャー',             iv:[0,2,4,5,7,9,11] },
  { id:'minor',   name:'MINOR',       jp:'ナチュラルマイナー',   iv:[0,2,3,5,7,8,10] },
  { id:'harm',    name:'HARM MINOR',  jp:'ハーモニックマイナー', iv:[0,2,3,5,7,8,11] },
  { id:'melo',    name:'MELO MINOR',  jp:'メロディックマイナー', iv:[0,2,3,5,7,9,11] },
  { id:'majpent', name:'MAJ PENTA',   jp:'メジャーペンタ',       iv:[0,2,4,7,9],      parent:[0,2,4,5,7,9,11] },
  { id:'minpent', name:'MIN PENTA',   jp:'マイナーペンタ',       iv:[0,3,5,7,10],     parent:[0,2,3,5,7,8,10] },
  { id:'blues',   name:'BLUES',       jp:'ブルース',             iv:[0,3,5,6,7,10],   parent:[0,2,3,5,7,8,10] },
  { id:'dorian',  name:'DORIAN',      jp:'ドリアン',             iv:[0,2,3,5,7,9,10] },
  { id:'mixo',    name:'MIXOLYDIAN',  jp:'ミクソリディアン',     iv:[0,2,4,5,7,9,10] },
  { id:'lydian',  name:'LYDIAN',      jp:'リディアン',           iv:[0,2,4,6,7,9,11] },
];

const CHORDS = {
  maj:{s:'',iv:[0,4,7]}, min:{s:'m',iv:[0,3,7]}, dim:{s:'dim',iv:[0,3,6]}, aug:{s:'aug',iv:[0,4,8]},
  sus4:{s:'sus4',iv:[0,5,7]}, sus2:{s:'sus2',iv:[0,2,7]}, six:{s:'6',iv:[0,4,7,9]},
  dom7:{s:'7',iv:[0,4,7,10]}, maj7:{s:'maj7',iv:[0,4,7,11]}, m7:{s:'m7',iv:[0,3,7,10]},
  m7b5:{s:'m7♭5',iv:[0,3,6,10]}, dim7:{s:'dim7',iv:[0,3,6,9]}, maj7s5:{s:'maj7♯5',iv:[0,4,8,11]},
  maj9:{s:'maj9',iv:[0,4,7,11,14]}, m9:{s:'m9',iv:[0,3,7,10,14]}, dom9:{s:'9',iv:[0,4,7,10,14]},
  m9b5:{s:'m9♭5',iv:[0,3,6,10,14]}, dom7s9:{s:'7♯9',iv:[0,4,7,10,15]}, sus47:{s:'7sus4',iv:[0,5,7,10]},
  add11:{s:'add11',iv:[0,4,7,17]}, madd11:{s:'m(add11)',iv:[0,3,7,17]}, add9:{s:'add9',iv:[0,4,7,14]},
  madd9:{s:'m(add9)',iv:[0,3,7,14]}, m11:{s:'m11',iv:[0,3,7,10,14,17]}, mmaj7:{s:'m(maj7)',iv:[0,3,7,11]},
  maj13:{s:'maj13',iv:[0,4,7,11,14,21]}, six9:{s:'6/9',iv:[0,4,7,9,14]}, maj7s11:{s:'maj7♯11',iv:[0,4,7,11,18]},
  dom13:{s:'13',iv:[0,4,7,10,14,21]}, dom7b9:{s:'7♭9',iv:[0,4,7,10,13]}, alt7:{s:'7alt',iv:[0,4,8,10,15]},
};

const DIRS = ['U','UR','R','DR','D','DL','L','UL'];
const DIR_ARROW = {U:'↑',UR:'↗',R:'→',DR:'↘',D:'↓',DL:'↙',L:'←',UL:'↖',C:'・'};
const JOY_MODES = ['DEFAULT','EXTENDED','CHROMATIC'];

/* joystick mode × direction × base quality → chord id */
function mapChord(mode, dir, q) {
  if (!dir || dir === 'C') return q;
  const minorish = (q === 'min' || q === 'dim');
  if (mode === 'DEFAULT') {
    switch (dir) {
      case 'U':  return q === 'maj' ? 'min' : q === 'aug' ? 'maj' : 'maj';
      case 'UR': return 'dom7';
      case 'R':  return q === 'maj' ? 'maj7' : q === 'min' ? 'm7' : q === 'dim' ? 'm7b5' : 'maj7s5';
      case 'DR': return q === 'maj' ? 'maj9' : q === 'min' ? 'm9' : q === 'dim' ? 'm9b5' : 'dom9';
      case 'D':  return 'sus4';
      case 'DL': return minorish ? 'sus2' : 'six';
      case 'L':  return q === 'maj' || q === 'aug' ? 'min' : q === 'min' ? 'dim' : 'dim7';
      case 'UL': return 'aug';
    }
  }
  if (mode === 'EXTENDED') {
    switch (dir) {
      case 'U':  return q === 'maj' || q === 'aug' ? 'min' : 'maj';
      case 'D':  return 'dom7s9';
      case 'L':  return 'sus47';
      case 'R':  return minorish ? 'madd11' : 'add11';
      case 'UL': return 'm7b5';
      case 'UR': return 'dom9';
      case 'DL': return minorish ? 'madd9' : 'add9';
      case 'DR': return 'm11';
    }
  }
  if (mode === 'CHROMATIC') {
    switch (dir) {
      case 'U':  return 'mmaj7';
      case 'D':  return 'maj13';
      case 'L':  return 'm7b5';
      case 'R':  return 'six9';
      case 'UL': return 'maj7s11';
      case 'UR': return 'dom13';
      case 'DL': return 'dom7b9';
      case 'DR': return 'alt7';
    }
  }
  return q;
}

function triadQuality(t, f) {
  if (t === 4 && f === 7) return 'maj';
  if (t === 3 && f === 7) return 'min';
  if (t === 3 && f === 6) return 'dim';
  if (t === 4 && f === 8) return 'aug';
  return t === 3 ? 'min' : 'maj';
}

/* scale degree i (0..6) → { semi, q } ; semi is offset from key root (may exceed 11 for pentatonic wrap) */
function degreeInfo(scale, i) {
  const iv = scale.iv, n = iv.length;
  if (n === 7) {
    const r = iv[i], t = (iv[(i + 2) % 7] - r + 12) % 12, f = (iv[(i + 4) % 7] - r + 12) % 12;
    return { semi: r, q: triadQuality(t, f) };
  }
  const semi = iv[i % n] + 12 * Math.floor(i / n);
  const pc = semi % 12, P = new Set(scale.parent);
  let q;
  if (P.has(pc)) {
    const idx = scale.parent.indexOf(pc);
    const t = (scale.parent[(idx + 2) % 7] - pc + 12) % 12, f = (scale.parent[(idx + 4) % 7] - pc + 12) % 12;
    q = triadQuality(t, f);
  } else q = 'dim';
  return { semi, q };
}

function chordName(rootPc, typeId) { return NOTE_NAMES[((rootPc % 12) + 12) % 12] + CHORDS[typeId].s; }

function romanFor(i, q) {
  let r = ROMAN[i];
  if (q === 'min' || q === 'dim') r = r.toLowerCase();
  if (q === 'dim') r += '°';
  if (q === 'aug') r += '+';
  return r;
}

/* Build voiced MIDI notes.
   opts: { keyPc, scale, deg, dir, joyMode, lockedType, btnOct, globalOct, inversion,
           voiceLead, prevNotes, bassMode, slashDeg } */
function buildChord(o) {
  const di = degreeInfo(o.scale, o.deg);
  const typeId = o.lockedType || mapChord(o.joyMode, o.dir, di.q);
  const rootMidi = 48 + o.keyPc + di.semi + 12 * ((o.globalOct || 0) + (o.btnOct || 0));
  let base = CHORDS[typeId].iv.map(x => rootMidi + x);
  let notes;
  if (o.voiceLead && o.prevNotes && o.prevNotes.length) {
    notes = bestVoicing(base, o.prevNotes);
  } else {
    notes = invert(base, o.inversion || 0);
  }
  const rootPc = (o.keyPc + di.semi) % 12;
  let bass = null;
  if (o.bassMode === 'ROOT') bass = 36 + rootPc + 12 * (o.globalOct || 0);
  else if (o.bassMode === 'SLASH') {
    const sd = o.slashDeg != null ? degreeInfo(o.scale, o.slashDeg) : di;
    bass = 36 + ((o.keyPc + sd.semi) % 12) + 12 * (o.globalOct || 0);
  }
  let name = chordName(rootPc, typeId);
  if (o.bassMode === 'SLASH' && o.slashDeg != null && o.slashDeg !== o.deg) {
    name += '/' + NOTE_NAMES[bass % 12];
  }
  return { notes, bass, typeId, rootPc, rootMidi, name, roman: romanFor(o.deg, di.q), q: di.q };
}

function invert(notes, k) {
  const a = notes.slice().sort((x, y) => x - y);
  const n = Math.min(k, a.length - 1);
  for (let j = 0; j < n; j++) a[j] += 12;
  return a.sort((x, y) => x - y);
}

function voicingCost(cand, prev) {
  let c = 0;
  for (const n of cand) { let m = 99; for (const p of prev) m = Math.min(m, Math.abs(n - p)); c += m; }
  const mc = cand.reduce((s, x) => s + x, 0) / cand.length, mp = prev.reduce((s, x) => s + x, 0) / prev.length;
  return c + Math.abs(mc - mp) * 0.5 + Math.abs(mc - 62) * 0.15;
}

function bestVoicing(base, prev) {
  let best = null, bc = 1e9;
  for (let inv = 0; inv < base.length; inv++) {
    for (const sh of [-24, -12, 0, 12]) {
      const cand = invert(base, inv).map(x => x + sh);
      if (cand[0] < 36 || cand[cand.length - 1] > 88) continue;
      const c = voicingCost(cand, prev);
      if (c < bc) { bc = c; best = cand; }
    }
  }
  return best || base;
}

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

if (typeof module !== 'undefined') module.exports = { NOTE_NAMES, SCALES, CHORDS, DIRS, JOY_MODES, mapChord, degreeInfo, buildChord, invert, bestVoicing, chordName, romanFor, midiToHz };
