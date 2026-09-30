#define _POSIX_C_SOURCE 200809L
#include "../ios/ChordPocket/Engine/cpsynth.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#define SRATE 48000
#define BLK 256
static char names[32][32]; static cp_patch_t P[32]; static int NP = 0;
static void load(void) {
  FILE *f = fopen("patches.txt", "r"); char line[2048];
  while (fgets(line, sizeof line, f)) {
    cp_patch_t p; memset(&p, 0, sizeof p); cp_sound_t *s = &p.snd; float fw[3], nf;
    int nw; char nm[32];
    int k = sscanf(line, "%31s %d %d %d %d %f %f %f %f %f %f %f %f %f %f %f %f %f %f %d %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %f %d",
      nm, &s->eng, &s->wave, &s->kind, &nw, &fw[0], &fw[1], &fw[2], &s->det[0], &s->det[1], &s->det[2], &s->mix[0], &s->mix[1], &s->mix[2],
      &s->lp, &s->fenv, &s->lfoFilt, &s->breath, &s->cut, &s->oct, &nf, &s->formant[0], &s->formant[1], &s->formant[2],
      &s->ratio, &s->index, &s->idxDecay, &s->idxAttack, &s->idxPeak, &s->tine, &s->ratio2,
      &p.a, &p.d, &p.s, &p.r, &p.level, &p.reverb, &p.delay, &p.chorus, &p.flanger, &p.tremolo, &p.tremRate, &p.vibrato, &p.cutoff, &p.glide, &p.stereo, &p.voices);
    if (k < 47) { fprintf(stderr, "parse %d\n", k); exit(1); }
    s->nwaves = nw; for (int i = 0; i < 3; i++) s->waves[i] = (int)fw[i]; s->nformant = (int)nf;
    strcpy(names[NP], nm); P[NP++] = p;
  }
}
static void ev(int type, int ch, int id, float midi, double t) { cp_event_t e; memset(&e, 0, sizeof e); e.type = type; e.ch = ch; e.id = id; e.midi = midi; e.vel = 0.8f; e.glideFrom = -1; e.time = t; cp_push(&e); }
static float *L, *R; static long total;
static void render_until(double t, double *host) {
  long want = (long)(t * SRATE);
  while (total < want) { cp_render(L + total, R + total, BLK, *host); total += BLK; *host += (double)BLK / SRATE; }
}
static void wav(const char *fn, long n) {
  FILE *f = fopen(fn, "wb"); int sr = SRATE, br = SRATE * 4; short ba = 4, bps = 16, ch = 2, fmt = 1; int ds = n * 4, rs = 36 + ds, fs = 16;
  fwrite("RIFF", 1, 4, f); fwrite(&rs, 4, 1, f); fwrite("WAVEfmt ", 1, 8, f); fwrite(&fs, 4, 1, f); fwrite(&fmt, 2, 1, f); fwrite(&ch, 2, 1, f); fwrite(&sr, 4, 1, f); fwrite(&br, 4, 1, f); fwrite(&ba, 2, 1, f); fwrite(&bps, 2, 1, f);
  fwrite("data", 1, 4, f); fwrite(&ds, 4, 1, f);
  for (long i = 0; i < n; i++) { short a = (short)(fmaxf(-1, fminf(1, L[i])) * 32767), b = (short)(fmaxf(-1, fminf(1, R[i])) * 32767); fwrite(&a, 2, 1, f); fwrite(&b, 2, 1, f); }
  fclose(f);
}
int main(void) {
  load(); cp_init(SRATE);
  for (int k = 0; k < 5; k++) for (int m = 36; m <= 90; m++) cp_prerender(k, m);
  long cap = SRATE * 120; L = calloc(cap, 4); R = calloc(cap, 4); double host = 1000.0; total = 0;
  cp_event_t pe; memset(&pe, 0, sizeof pe); pe.type = CP_EV_VOLUME; pe.value = 0.8f; cp_push(&pe);
  pe.type = CP_EV_DELAYTIME; pe.value = 0.3f; cp_push(&pe);
  int id = 1; double t = 0.1; int bad = 0;
  printf("%-10s %8s %8s\n", "sound", "rms", "peak");
  for (int i = 0; i < NP; i++) {
    cp_event_t e; memset(&e, 0, sizeof e); e.type = CP_EV_PATCH; e.ch = 0; e.patch = P[i]; cp_push(&e);
    int ids[3]; float notes[3] = { 60, 64, 67 };
    for (int k = 0; k < 3; k++) { ids[k] = id++; ev(CP_EV_NOTE_ON, 0, ids[k], notes[k], host + (t - total / (double)SRATE)); }
    long s0 = (long)(t * SRATE);
    for (int k = 0; k < 3; k++) ev(CP_EV_NOTE_OFF, 0, ids[k], 0, host + (t + 0.9 - total / (double)SRATE));
    render_until(t + 1.6, &host);
    double ss = 0, pk = 0; for (long j = s0; j < s0 + (long)(0.9 * SRATE); j++) { float x = L[j]; if (!isfinite(x)) { bad = 1; } ss += x * x; pk = fmax(pk, fabs(x)); }
    double rms = sqrt(ss / (0.9 * SRATE));
    printf("%-10s %8.4f %8.4f %s\n", names[i], rms, pk, rms < 0.005 ? "<-- TOO QUIET" : "");
    t += 1.6;
  }
  /* drums + clicks */
  cp_event_t g; memset(&g, 0, sizeof g); g.type = CP_EV_GATE; g.ch = 1; g.value = 1; cp_push(&g);
  long d0 = (long)(t * SRATE);
  for (int k = 0; k < 9; k++) { cp_event_t d; memset(&d, 0, sizeof d); d.type = CP_EV_DRUM; d.ch = 1; d.drum = k; d.vel = 1; d.kit = 0; d.time = host + (t + k * 0.3 - total / (double)SRATE); cp_push(&d); }
  for (int k = 0; k < 4; k++) { cp_event_t c; memset(&c, 0, sizeof c); c.type = CP_EV_CLICK; c.value = k == 0; c.time = host + (t + 3 + k * 0.25 - total / (double)SRATE); cp_push(&c); }
  render_until(t + 4.5, &host);
  double ss = 0; for (long j = d0; j < total; j++) ss += L[j] * L[j]; printf("drums+clicks rms %.4f\n", sqrt(ss / (total - d0)));
  /* glide test */
  cp_event_t e; memset(&e, 0, sizeof e); e.type = CP_EV_PATCH; e.ch = 0; e.patch = P[2]; cp_push(&e);
  ev(CP_EV_NOTE_ON, 0, 999, 60, 0); render_until(t + 4.8, &host);
  cp_event_t gl; memset(&gl, 0, sizeof gl); gl.type = CP_EV_GLIDE; gl.id = 999; gl.midi = 72; cp_push(&gl); render_until(t + 5.4, &host);
  ev(CP_EV_NOTE_OFF, 0, 999, 0, 0); render_until(t + 6.5, &host);
  /* stress: 48 voices of heavy pad with chorus+flanger */
  cp_patch_t heavy = P[13]; heavy.voices = 8; heavy.chorus = 1; heavy.flanger = 1; heavy.vibrato = 1;
  for (int c = 0; c < 6; c++) { memset(&e, 0, sizeof e); e.type = CP_EV_PATCH; e.ch = 2 + c; e.patch = heavy; cp_push(&e); for (int k = 0; k < 8; k++) ev(CP_EV_NOTE_ON, 2 + c, 5000 + c * 10 + k, 48 + k * 3 + c, 0); }
  struct timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a); long before = total; render_until(t + 9.5, &host); clock_gettime(CLOCK_MONOTONIC, &b);
  double el = (b.tv_sec - a.tv_sec) + (b.tv_nsec - a.tv_nsec) * 1e-9, audio = (total - before) / (double)SRATE;
  printf("stress 48 heavy voices: %.1f%% of real time (this CPU)\n", 100 * el / audio);
  for (long j = 0; j < total; j++) if (!isfinite(L[j]) || !isfinite(R[j]) || fabsf(L[j]) > 1.0f) { bad = 1; break; }
  wav("render.wav", total);
  printf("%s\n", bad ? "FAIL: non-finite or clipped samples" : "OK: all samples finite and within [-1,1]");
  return bad;
}
