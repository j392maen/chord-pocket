const T=require('../src/theory.js');const assert=require('assert');
const maj=T.SCALES[0];
const qs=[0,1,2,3,4,5,6].map(i=>T.degreeInfo(maj,i).q);
assert.deepStrictEqual(qs,['maj','min','min','maj','maj','min','dim']);
const min=T.SCALES[1];assert.deepStrictEqual([0,1,2,3,4,5,6].map(i=>T.degreeInfo(min,i).q),['min','dim','maj','min','min','maj','maj']);
const hm=T.SCALES[2];assert.equal(T.degreeInfo(hm,2).q,'aug');assert.equal(T.degreeInfo(hm,4).q,'maj');
// C major I = C E G
let c=T.buildChord({keyPc:0,scale:maj,deg:0,dir:'C',joyMode:'DEFAULT'});assert.deepStrictEqual(c.notes,[48,52,55]);assert.equal(c.name,'C');
c=T.buildChord({keyPc:0,scale:maj,deg:5,dir:'R',joyMode:'DEFAULT'});assert.equal(c.name,'Am7');
c=T.buildChord({keyPc:0,scale:maj,deg:4,dir:'UR',joyMode:'DEFAULT'});assert.equal(c.name,'G7');
c=T.buildChord({keyPc:0,scale:maj,deg:0,dir:'U',joyMode:'DEFAULT'});assert.equal(c.name,'Cm');
c=T.buildChord({keyPc:0,scale:maj,deg:1,dir:'U',joyMode:'DEFAULT'});assert.equal(c.name,'D');
c=T.buildChord({keyPc:7,scale:maj,deg:6,dir:'R',joyMode:'DEFAULT'});assert.equal(c.name,'F#m7♭5');
c=T.buildChord({keyPc:0,scale:maj,deg:0,dir:'D',joyMode:'CHROMATIC'});assert.equal(c.name,'Cmaj13');
c=T.buildChord({keyPc:0,scale:maj,deg:0,inversion:1,dir:'C',joyMode:'DEFAULT'});assert.deepStrictEqual(c.notes,[52,55,60]);
c=T.buildChord({keyPc:0,scale:maj,deg:0,inversion:2,dir:'C',joyMode:'DEFAULT'});assert.deepStrictEqual(c.notes,[55,60,64]);
// slash
c=T.buildChord({keyPc:0,scale:maj,deg:0,dir:'C',joyMode:'DEFAULT',bassMode:'SLASH',slashDeg:4});assert.equal(c.name,'C/G');assert.equal(c.bass,43);
// voice leading: C then F should stay close
const p=T.buildChord({keyPc:0,scale:maj,deg:0,dir:'C',joyMode:'DEFAULT'}).notes;
c=T.buildChord({keyPc:0,scale:maj,deg:3,dir:'C',joyMode:'DEFAULT',voiceLead:true,prevNotes:p});console.log('C->F VL',c.notes);
assert.ok(Math.max(...c.notes)-Math.min(...c.notes)<=12);
// pentatonic/blues
const bl=T.SCALES[6];console.log('blues',[0,1,2,3,4,5,6].map(i=>T.buildChord({keyPc:9,scale:bl,deg:i,dir:'C',joyMode:'DEFAULT'}).name));
console.log('majpent',[0,1,2,3,4,5,6].map(i=>T.buildChord({keyPc:0,scale:T.SCALES[4],deg:i,dir:'C',joyMode:'DEFAULT'}).name));
// every mode/dir/quality maps to a known chord
for(const m of T.JOY_MODES)for(const d of T.DIRS)for(const q of ['maj','min','dim','aug'])assert.ok(T.CHORDS[T.mapChord(m,d,q)],m+d+q);
console.log('ALL THEORY TESTS PASSED');
