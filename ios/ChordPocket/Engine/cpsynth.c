#define _POSIX_C_SOURCE 200809L
// Chord Pocket native synth engine. Port of the Web Audio graph in src/audio.js.
// Real-time rules on the audio thread: no malloc/free, no locks, no Objective-C/Swift calls.
#include "cpsynth.h"
#include <math.h>
#include <string.h>
#include <stdlib.h>
#include <stdatomic.h>
#include <time.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#define TWO_PI 6.28318530717958647692f
#define SUB 32                       /* control-rate sub-block */
#define RING 4096
#define PENDING 2048
#define SCOPE_N 2048

static double SR = 48000.0; static float ISR = 1.0f / 48000.0f;
static inline float midi_hz(float m) { return 440.0f * powf(2.0f, (m - 69.0f) / 12.0f); }
static inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
static inline unsigned xr(unsigned *s) { unsigned x = *s; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return *s = x ? x : 0x9e3779b9u; }
static inline float frand(unsigned *s) { return (float)(xr(s) & 0xffffff) / 8388608.0f - 1.0f; }
static inline float tc_coef(float tc) { return 1.0f - expf(-1.0f / (fmaxf(tc, 0.0005f) * (float)SR)); }

/* ---------- biquad (RBJ) ---------- */
typedef struct { float b0, b1, b2, a1, a2, z1, z2; } bq_t;
static void bq_set(bq_t *q, int type, float f, float Q) {
    f = clampf(f, 10.0f, (float)SR * 0.49f);
    float w = TWO_PI * f * ISR, cw = cosf(w), sw = sinf(w), al = sw / (2.0f * fmaxf(Q, 0.01f));
    float b0, b1, b2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    if (type == 0) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }            /* lowpass */
    else if (type == 1) { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }    /* highpass */
    else { b0 = al; b1 = 0; b2 = -al; }                                              /* bandpass (0 dB peak) */
    q->b0 = b0 / a0; q->b1 = b1 / a0; q->b2 = b2 / a0; q->a1 = a1 / a0; q->a2 = a2 / a0;
}
static inline float bq_run(bq_t *q, float x) {
    float y = q->b0 * x + q->z1; q->z1 = q->b1 * x - q->a1 * y + q->z2; q->z2 = q->b2 * x - q->a2 * y;
    return y;
}

/* ---------- oscillators ---------- */
static inline float blep(float t, float dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1.0f; }
    if (t > 1.0f - dt) { t = (t - 1.0f) / dt; return t * t + t + t + 1.0f; }
    return 0.0f;
}
static inline float osc(int wave, float ph, float dt) {   /* ph in [0,1) */
    switch (wave) {
        case CP_WAVE_SINE: return sinf(TWO_PI * ph);
        case CP_WAVE_TRI:  return 1.0f - 4.0f * fabsf(ph - 0.5f);
        case CP_WAVE_SAW:  return (2.0f * ph - 1.0f) - blep(ph, dt);
        default: {
            float v = ph < 0.5f ? 1.0f : -1.0f;
            v += blep(ph, dt); float p2 = ph + 0.5f; if (p2 >= 1.0f) p2 -= 1.0f; v -= blep(p2, dt);
            return v;
        }
    }
}

/* ---------- pre-rendered instruments ---------- */
static float *_Atomic RTAB[CP_KIND_COUNT][128];
static int RLEN[CP_KIND_COUNT][128];
int cp_is_rendered(int kind, int midi) { return kind >= 0 && kind < CP_KIND_COUNT && midi >= 0 && midi < 128 && atomic_load(&RTAB[kind][midi]) != NULL; }
void cp_prerender(int kind, int midi) {
    if (kind < 0 || kind >= CP_KIND_COUNT || midi < 0 || midi > 127 || cp_is_rendered(kind, midi)) return;
    const float sr = (float)SR, f = midi_hz((float)midi);
    float dur = kind == CP_KIND_SHUTTER ? 0.6f : kind == CP_KIND_VIBES ? 3.5f : kind == CP_KIND_PIANO ? fmaxf(1.6f, 4.5f - (midi - 48) * 0.05f) : 3.0f;
    int len = (int)(sr * dur);
    float *d = (float *)calloc((size_t)len, sizeof(float)); if (!d) return;
    unsigned rng = 0x1234567u + (unsigned)midi * 7919u + (unsigned)kind * 104729u;
    if (kind == CP_KIND_PIANO || kind == CP_KIND_VIBES) {
        float pn[12], pa[12], pd[12]; int np;
        if (kind == CP_KIND_PIANO) { np = 12; for (int i = 0; i < 12; i++) { float n = (float)(i + 1); pn[i] = n; pa[i] = 1.0f / powf(n, 1.1f) * (i == 0 ? 1.0f : 0.8f); pd[i] = 0.9f + n * 0.9f; } }
        else { np = 3; pn[0] = 1; pa[0] = 1; pd[0] = 0.6f; pn[1] = 3.98f; pa[1] = 0.35f; pd[1] = 2.4f; pn[2] = 9.87f; pa[2] = 0.12f; pd[2] = 5.0f; }
        float B = kind == CP_KIND_PIANO ? 0.00035f : 0.0f, kd = kind == CP_KIND_PIANO ? 1.0f + fmaxf(0.0f, midi - 60.0f) * 0.03f : 1.0f;
        for (int p = 0; p < np; p++) {
            float fr = f * pn[p] * sqrtf(1.0f + B * pn[p] * pn[p]); if (fr > sr * 0.45f) continue;
            double w = 2.0 * M_PI * fr / sr, ph = (xr(&rng) % 6283) / 1000.0;
            double c = cos(w), s = sin(w), re = cos(ph), im = sin(ph), dec = exp(-pd[p] * kd / sr), a = pa[p];
            for (int i = 0; i < len; i++) { d[i] += (float)(a * im); double nr = re * c - im * s; im = re * s + im * c; re = nr; a *= dec; }
        }
        if (kind == CP_KIND_PIANO) { int hn = (int)(sr * 0.015f); for (int i = 0; i < hn && i < len; i++) d[i] += frand(&rng) * 0.25f * (1.0f - (float)i / hn); }
    } else {
        float period = sr / f; int N = (int)period; if (N < 2) N = 2; float frac = period - N;
        float *line = (float *)calloc((size_t)N + 2, sizeof(float)); if (!line) { free(d); return; }
        float bright = kind == CP_KIND_HARP ? 0.9f : kind == CP_KIND_SHUTTER ? 0.2f : 0.65f;
        float damp = kind == CP_KIND_SHUTTER ? 0.985f : kind == CP_KIND_HARP ? 0.9985f : 0.9965f, lp = 0;
        for (int i = 0; i < N + 2; i++) { lp = lp * (1 - bright) + frand(&rng) * bright; line[i] = lp; }
        int idx = 0; float prev = 0;
        for (int i = 0; i < len; i++) {
            float a = line[idx], b = line[(idx + 1) % N], out = a * (1 - frac * 0.5f) + b * (frac * 0.5f);
            d[i] = out; line[idx] = damp * 0.5f * (out + prev); prev = out; idx = (idx + 1) % N;
        }
        free(line);
        if (kind == CP_KIND_GUITAR) {
            int dl = (int)(sr * 0.0021f); for (int i = len - 1; i >= dl; i--) d[i] += d[i - dl] * 0.25f;
            float y = 0; for (int i = 0; i < len; i++) { y = y * 0.35f + d[i] * 0.65f; d[i] = y; }
        }
    }
    float peak = 0; for (int i = 0; i < len; i++) peak = fmaxf(peak, fabsf(d[i]));
    float g = peak > 0 ? 0.6f / peak : 1.0f; for (int i = 0; i < len; i++) d[i] *= g;
    int fl = (int)(sr * 0.05f); for (int i = len - fl; i < len; i++) if (i >= 0) d[i] *= (float)(len - i) / fl;
    RLEN[kind][midi] = len;
    float *expected = NULL;
    if (!atomic_compare_exchange_strong(&RTAB[kind][midi], &expected, d)) free(d);
}

/* ---------- user sample ---------- */
static float *_Atomic USER = NULL; static _Atomic int USER_LEN = 0; static double USER_SR = 44100; static float USER_ROOT = 261.63f;
float *cp_set_user_sample(float *data, int length, double sampleRate, float rootHz) {
    USER_SR = sampleRate; USER_ROOT = rootHz;
    atomic_store(&USER_LEN, 0);
    float *old = atomic_exchange(&USER, data);
    atomic_store(&USER_LEN, length);
    return old;
}

/* ---------- voices ---------- */
typedef struct {
    int active, id, ch, stage, delay; unsigned age;
    float midi, vel, peak, env, ainc, dcoef, rcoef, sus; int pluck;
    double offTime;
    cp_sound_t snd; int unison;
    float freq, glideMul; int glideN;
    int nosc; int otype[CP_MAX_OSC]; float oph[CP_MAX_OSC], orat[CP_MAX_OSC], ogain[CP_MAX_OSC];
    float mph, idx, idxTarget, idxCoef, idxInc; int idxStage, idxN;
    const float *buf; int buflen; double pos; float rateBase, bufGain;
    bq_t lp; float lpBase, lpCur; int fenvN; float lfoPh; bq_t bp[3]; float bpg[3]; bq_t nbp; unsigned rng;
    float panL, panR;
} voice_t;

typedef struct {
    int active, ch, delay, kind, wave; float f, fmul; int fN; float ph; bq_t filt; unsigned rng;
    float amp, peak, ainc, dmul; int attN, life;
} dvoice_t;

typedef struct {
    int used; cp_patch_t p;
    float gate, gateT, cutoffApplied; bq_t fL, fR;
    float cbuf[4096]; int cw; float fbuf[2048]; int fwi; float ffb;
    float lc1, lc2, lfl, ltr, lvib, vibCents;
    float busL[SUB], busR[SUB], drL[SUB], drR[SUB];
    int panFlip, any;
} chan_t;

static voice_t V[CP_MAX_VOICES];
static dvoice_t D[CP_MAX_DRUMS];
static chan_t C[CP_MAX_CH];
static unsigned AGE = 1;

/* ---------- global FX ---------- */
#define NCOMB 8
#define NAP 4
static const int COMB_T[NCOMB] = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 };
static const int AP_T[NAP] = { 556, 441, 341, 225 };
typedef struct { float *b; int n, i; float store; } comb_t;
typedef struct { float *b; int n, i; } ap_t;
static comb_t CL[NCOMB], CR[NCOMB]; static ap_t AL[NAP], AR[NAP];
static float *DLY; static int DLYN, DLYW; static float dlyTime = 0.25f, dlyTimeT = 0.25f, dlyLP = 0;
static float masterVol = 0.8f, masterVolT = 0.8f, limEnv = 0;
static float SCOPE[SCOPE_N]; static _Atomic int scopeW = 0;
static float LOAD = 0;
static float CLICKBUF[SUB];

/* ---------- event ring ---------- */
static cp_event_t RB[RING]; static _Atomic unsigned rbHead = 0, rbTail = 0;
static cp_event_t PEND[PENDING]; static int npend = 0;

int cp_push(const cp_event_t *ev) {
    unsigned h = atomic_load_explicit(&rbHead, memory_order_relaxed), t = atomic_load_explicit(&rbTail, memory_order_acquire);
    if (h - t >= RING) return 0;
    RB[h % RING] = *ev;
    atomic_store_explicit(&rbHead, h + 1, memory_order_release);
    return 1;
}

double cp_sample_rate(void) { return SR; }

void cp_init(double sampleRate) {
    SR = sampleRate > 8000 ? sampleRate : 48000; ISR = (float)(1.0 / SR);
    memset(V, 0, sizeof V); memset(D, 0, sizeof D); memset(C, 0, sizeof C);
    float scale = (float)(SR / 44100.0);
    for (int i = 0; i < NCOMB; i++) {
        CL[i].n = (int)(COMB_T[i] * scale); CR[i].n = (int)((COMB_T[i] + 23) * scale);
        free(CL[i].b); free(CR[i].b); CL[i].b = calloc((size_t)CL[i].n, 4); CR[i].b = calloc((size_t)CR[i].n, 4); CL[i].i = CR[i].i = 0; CL[i].store = CR[i].store = 0;
    }
    for (int i = 0; i < NAP; i++) {
        AL[i].n = (int)(AP_T[i] * scale); AR[i].n = (int)((AP_T[i] + 23) * scale);
        free(AL[i].b); free(AR[i].b); AL[i].b = calloc((size_t)AL[i].n, 4); AR[i].b = calloc((size_t)AR[i].n, 4); AL[i].i = AR[i].i = 0;
    }
    DLYN = (int)(SR * 4.1); free(DLY); DLY = calloc((size_t)DLYN, 4); DLYW = 0;
    npend = 0; atomic_store(&rbTail, atomic_load(&rbHead));
}

/* ---------- note on ---------- */
static voice_t *alloc_voice(void) {
    voice_t *best = NULL;
    for (int i = 0; i < CP_MAX_VOICES; i++) if (!V[i].active) return &V[i];
    for (int i = 0; i < CP_MAX_VOICES; i++) if (V[i].stage == 3 && (!best || V[i].env < best->env)) best = &V[i];
    if (best) return best;
    for (int i = 0; i < CP_MAX_VOICES; i++) if (!best || V[i].age < best->age) best = &V[i];
    return best;
}
static void voice_set_env(voice_t *v, const cp_patch_t *p) {
    float a = fmaxf(0.002f, p->a);
    v->ainc = v->peak / (a * (float)SR);
    v->sus = p->s; v->dcoef = tc_coef(fmaxf(0.01f, p->d / 3.0f)); v->rcoef = tc_coef(fmaxf(0.01f, p->r) / 4.0f);
    v->pluck = p->s <= 0.0f;
}
static void note_on(const cp_event_t *e, int delay) {
    if (e->ch < 0 || e->ch >= CP_MAX_CH || !C[e->ch].used) return;
    chan_t *c = &C[e->ch]; const cp_patch_t *p = &c->p; voice_t *v = alloc_voice();
    memset(v, 0, sizeof *v);
    v->active = 1; v->id = e->id; v->ch = e->ch; v->delay = delay; v->stage = 0; v->age = AGE++;
    v->midi = e->midi; v->vel = e->vel <= 0 ? 0.8f : e->vel; v->peak = v->vel * 0.22f; v->snd = p->snd; v->unison = p->voices < 1 ? 1 : p->voices;
    v->rng = 0xabcdef1u ^ (unsigned)e->id * 2654435761u;
    voice_set_env(v, p);
    const cp_sound_t *s = &v->snd;
    float f = midi_hz(e->midi + 12.0f * s->oct);
    v->freq = f;
    if (e->glideFrom >= 0 && p->glide > 0) {
        float gt = p->glide * 0.4f, f0 = midi_hz(e->glideFrom + 12.0f * s->oct);
        v->freq = f0; v->glideN = (int)(gt * SR); v->glideMul = powf(f / f0, 1.0f / (float)(v->glideN > 0 ? v->glideN : 1));
    }
    c->panFlip = (c->panFlip + 1) % 4;
    static const float PANS[4] = { -0.9f, 0.9f, -0.4f, 0.4f };
    float pan = p->stereo * PANS[c->panFlip], ang = (pan + 1.0f) * (float)M_PI / 4.0f;
    /* StereoPanner with mono input: L=cos, R=sin of ((p+1)pi/4); centre = 0.707 each */
    v->panL = cosf(ang); v->panR = sinf(ang);
    int n = 0;
    #define ADD(W, R, G) do { if (n < CP_MAX_OSC) { v->otype[n] = (W); v->orat[n] = (R); v->ogain[n] = (G); v->oph[n] = 0; n++; } } while (0)
    switch (s->eng) {
        case CP_ENG_ANALOG: {
            int u = v->unison;
            for (int k = 0; k < u; k++) {
                float det = u == 1 ? 0 : ((float)k / (u - 1) - 0.5f) * 2.0f * 12.0f * fminf(1.0f, u / 4.0f);
                ADD(s->wave, powf(2.0f, det / 1200.0f), 1.0f / sqrtf((float)u));
                v->oph[n - 1] = (float)(xr(&v->rng) % 1000) / 1000.0f * (u > 1);
            }
        } break;
        case CP_ENG_FM: {
            ADD(CP_WAVE_SINE, 1.0f, 1.0f);                  /* carrier = osc 0 */
            if (s->tine > 0) ADD(CP_WAVE_SINE, s->tine, 0.08f);
            if (s->ratio2 > 0) ADD(CP_WAVE_SINE, s->ratio2, 0.12f);
            if (v->unison > 1) ADD(CP_WAVE_SINE, powf(2.0f, 7.0f / 1200.0f), 0.5f);
            float I = s->index * f;
            if (s->idxAttack > 0) { v->idx = I * 0.3f; v->idxStage = 1; v->idxN = (int)(s->idxAttack * SR); v->idxInc = (s->idxPeak * f * 0.5f - v->idx) / (float)(v->idxN > 0 ? v->idxN : 1); v->idxTarget = I; v->idxCoef = tc_coef(0.3f); }
            else { v->idx = I; v->idxStage = 2; v->idxTarget = I * 0.15f; v->idxCoef = tc_coef(fmaxf(0.01f, s->idxDecay / 3.0f)); }
        } break;
        case CP_ENG_RENDER: {
            int m = (int)lrintf(e->midi); if (m < 0) m = 0; if (m > 127) m = 127;
            float *b = atomic_load(&RTAB[s->kind][m]);
            if (b) { v->buf = b; v->buflen = RLEN[s->kind][m]; v->rateBase = 1.0f / midi_hz((float)m); v->bufGain = s->kind == CP_KIND_SHUTTER ? 4.0f : 1.6f; }
            else ADD(CP_WAVE_TRI, 1.0f, 0.6f);             /* not rendered yet: soft fallback */
        } break;
        case CP_ENG_SAMPLE: {
            float *b = atomic_load(&USER); int l = atomic_load(&USER_LEN);
            if (b && l > 0) { v->buf = b; v->buflen = l; v->rateBase = (float)(USER_SR / SR) / USER_ROOT; v->bufGain = 1.4f; }
            else ADD(CP_WAVE_TRI, 1.0f, 1.0f);
        } break;
        default: {
            int uni = v->unison / 2; if (uni < 1) uni = 1; if (uni > 2) uni = 2;
            for (int i = 0; i < s->nwaves; i++) for (int u = 0; u < uni; u++)
                ADD(s->waves[i], powf(2.0f, (s->det[i] + (u ? 9.0f : 0.0f)) / 1200.0f), (s->mix[i] > 0 ? s->mix[i] : 1.0f) / s->nwaves / uni);
            if (s->nformant > 0) { static const float FG[3] = { 2.2f, 1.4f, 0.8f }; for (int i = 0; i < s->nformant && i < 3; i++) { bq_set(&v->bp[i], 2, s->formant[i], 6.0f); v->bpg[i] = FG[i]; } }
            else if (s->lp > 0) { v->lpBase = fminf(12000.0f, s->lp * (1.0f + (e->midi - 60.0f) / 60.0f)); v->lpCur = v->lpBase; bq_set(&v->lp, 0, v->lpBase, 1.5f); }
            if (s->breath > 0) bq_set(&v->nbp, 2, f * 2.0f, 2.0f);
        } break;
    }
    v->nosc = n;
}
static voice_t *find_voice(int id) { for (int i = 0; i < CP_MAX_VOICES; i++) if (V[i].active && V[i].id == id) return &V[i]; return NULL; }
static void release_voice(voice_t *v) { if (v->stage != 3) { v->stage = 3; if (v->delay > 0) v->active = 0; } }

/* ---------- drums (port of DrumChannel.hit) ---------- */
typedef struct { float pitch, decay, tone, hp, bright; } kit_t;
static const kit_t KITS[7] = {
    { 1.0f, 1.0f, 0.5f, 7000, 0.6f }, { 0.8f, 2.2f, 0.7f, 8000, 0.5f }, { 1.1f, 1.2f, 0.4f, 9000, 0.9f }, { 0.9f, 0.8f, 0.5f, 4000, 0.3f },
    { 1.3f, 0.6f, 0.8f, 10000, 1.0f }, { 1.2f, 1.4f, 0.3f, 6000, 0.4f }, { 0.7f, 0.9f, 0.6f, 3000, 0.2f } };
static dvoice_t *alloc_drum(void) { dvoice_t *o = &D[0]; for (int i = 0; i < CP_MAX_DRUMS; i++) { if (!D[i].active) return &D[i]; if (D[i].life < o->life) o = &D[i]; } return o; }
static void d_env(dvoice_t *d, float peak, float dec) {
    d->amp = 0.0001f; d->peak = peak; d->attN = (int)(0.002 * SR); d->ainc = (peak - 0.0001f) / (float)d->attN;
    int n = (int)((dec - 0.002f) * SR); if (n < 1) n = 1; d->dmul = powf(0.0001f / fmaxf(peak, 0.0002f), 1.0f / n); d->life = d->attN + n;
}
static void d_tone(int ch, int delay, float f0, float f1, float dec, float peak, int wave) {
    dvoice_t *d = alloc_drum(); memset(d, 0, sizeof *d); d->active = 1; d->ch = ch; d->delay = delay; d->kind = 0; d->wave = wave;
    d->f = f0; d->fN = (int)(dec * 0.6f * SR); d->fmul = powf(f1 / f0, 1.0f / (float)(d->fN > 0 ? d->fN : 1)); d_env(d, peak, dec);
}
static void d_noise(int ch, int delay, float dec, int type, float fr, float q, float peak) {
    dvoice_t *d = alloc_drum(); memset(d, 0, sizeof *d); d->active = 1; d->ch = ch; d->delay = delay; d->kind = 1; d->rng = 0x51f15eu + (unsigned)(AGE++) * 7u;
    bq_set(&d->filt, type, fr, q); d_env(d, peak, dec);
}
static void drum_hit(int ch, int i, float vel, int kit, int delay) {
    if (kit < 0 || kit > 6) { kit = 0; }
    const kit_t *k = &KITS[kit]; vel = vel <= 0 ? 1 : vel;
    int sr = (int)SR;
    switch (i) {
        case 0: d_tone(ch, delay, 150 * k->pitch, 45 * k->pitch, 0.35f * k->decay, 1.0f * vel, CP_WAVE_SINE); d_noise(ch, delay, 0.01f, 0, 3000, 1, 0.3f * k->bright * vel); break;
        case 1: d_tone(ch, delay, 220 * k->pitch, 160 * k->pitch, 0.12f * k->decay, (0.5f * k->tone + 0.2f) * vel, CP_WAVE_TRI); d_noise(ch, delay, 0.18f * k->decay, 2, 1800 * k->pitch, 0.8f, 0.6f * vel); break;
        case 2: for (int r = 0; r < 3; r++) d_noise(ch, delay + (int)(r * 0.011f * sr), r == 2 ? 0.2f * k->decay : 0.012f, 2, 1200 * k->pitch, 1.2f, 0.7f * vel); break;
        case 3: d_noise(ch, delay, 0.05f * k->decay, 1, k->hp, 0.7f, 0.35f * vel); break;
        case 4: d_tone(ch, delay, 180 * k->pitch, 90 * k->pitch, 0.3f * k->decay, 0.7f * vel, CP_WAVE_SINE); break;
        case 5: { for (int q = 0; q < 2; q++) { float fr = (q ? 800.0f : 540.0f) * k->pitch; dvoice_t *d = alloc_drum(); memset(d, 0, sizeof *d);
                    d->active = 1; d->ch = ch; d->delay = delay; d->kind = 2; d->wave = CP_WAVE_SQUARE; d->f = fr; d->fmul = 1; bq_set(&d->filt, 2, 900 * k->pitch, 3); d_env(d, 0.35f * vel, 0.25f * k->decay); } } break;
        case 6: d_noise(ch, delay, 1.1f * k->decay, 1, k->hp * 0.8f, 0.5f, 0.35f * vel); break;
        case 7: d_noise(ch, delay, 0.28f * k->decay, 1, k->hp, 0.7f, 0.3f * vel); break;
        case 8: d_noise(ch, delay, 0.5f, 2, 5200, 3, 0.18f * vel); d_tone(ch, delay, 4200, 4000, 0.4f, 0.04f * vel, CP_WAVE_TRI); break;
    }
}
static void click(int accent, int delay) { d_tone(-1, delay, accent ? 1760.0f : 1175.0f, accent ? 1760.0f : 1175.0f, 0.05f, 0.16f, CP_WAVE_SINE); }

/* ---------- event dispatch ---------- */
static void apply_patch(int ch, const cp_patch_t *p) {
    if (ch < 0 || ch >= CP_MAX_CH) return;
    chan_t *c = &C[ch];
    if (!c->used) { memset(c, 0, sizeof *c); c->used = 1; c->gate = c->gateT = 1.0f; c->ffb = 0; }
    c->p = *p; c->cutoffApplied = -1;
}
static void exec_now(const cp_event_t *e, int delay) {
    switch (e->type) {
        case CP_EV_NOTE_ON: note_on(e, delay); break;
        case CP_EV_NOTE_OFF: {
            voice_t *v = find_voice(e->id);
            if (v) { if (delay > 0 && v->stage != 3) v->offTime = -delay; else release_voice(v); }
            else {   /* note-on still waiting in the pending list: cancel it so it can't start un-released */
                for (int i = 0; i < npend; i++) if (PEND[i].type == CP_EV_NOTE_ON && PEND[i].id == e->id) PEND[i].type = 0;
            }
        } break;
        case CP_EV_GLIDE: { voice_t *v = find_voice(e->id); if (v) { chan_t *c = &C[v->ch]; float f1 = midi_hz(e->midi + 12.0f * v->snd.oct); float gt = fmaxf(0.005f, c->p.glide * 0.4f);
                              v->glideN = (int)(gt * SR); v->glideMul = powf(f1 / v->freq, 1.0f / (float)(v->glideN > 0 ? v->glideN : 1)); v->midi = e->midi; } } break;
        case CP_EV_PATCH: apply_patch(e->ch, &e->patch); break;
        case CP_EV_GATE: if (e->ch >= 0 && e->ch < CP_MAX_CH) { if (!C[e->ch].used) { memset(&C[e->ch], 0, sizeof C[0]); C[e->ch].used = 1; C[e->ch].gate = e->value; } C[e->ch].gateT = e->value; } break;
        case CP_EV_DRUM: if (e->ch >= 0 && e->ch < CP_MAX_CH) { if (!C[e->ch].used) { memset(&C[e->ch], 0, sizeof C[0]); C[e->ch].used = 1; C[e->ch].gate = C[e->ch].gateT = 1; } drum_hit(e->ch, e->drum, e->vel, e->kit, delay); } break;
        case CP_EV_KILL:
            for (int i = 0; i < CP_MAX_VOICES; i++) if (V[i].active && V[i].ch == e->ch) { V[i].stage = 3; V[i].rcoef = tc_coef(0.01f); V[i].offTime = 0; }
            for (int i = 0; i < CP_MAX_DRUMS; i++) if (D[i].active && D[i].ch == e->ch) D[i].active = 0;
            for (int i = 0; i < npend; i++) if (PEND[i].ch == e->ch) PEND[i].type = 0;
            break;
        case CP_EV_VOLUME: masterVolT = clampf(e->value, 0, 1); break;
        case CP_EV_DELAYTIME: dlyTimeT = clampf(e->value, 0.01f, 3.9f); break;
        case CP_EV_CLICK: click(e->value > 0.5f, delay); break;
    }
}

/* ---------- render ---------- */
static inline float render_voice(voice_t *v, float vibMul) {
    const cp_sound_t *s = &v->snd;
    if (v->glideN > 0) { v->freq *= v->glideMul; v->glideN--; }
    float f = v->freq * vibMul, out = 0;
    if (v->buf) {
        int i0 = (int)v->pos; if (i0 >= v->buflen - 1) { v->active = 0; return 0; }
        float fr = (float)(v->pos - i0); out = (v->buf[i0] * (1 - fr) + v->buf[i0 + 1] * fr) * v->bufGain;
        v->pos += (double)(f * v->rateBase);
    }
    if (s->eng == CP_ENG_FM && v->nosc > 0) {
        float mod = sinf(TWO_PI * v->mph); v->mph += f * s->ratio * ISR; v->mph -= floorf(v->mph);
        float cf = f + mod * v->idx;
        out += sinf(TWO_PI * v->oph[0]) * v->ogain[0]; v->oph[0] += cf * ISR; v->oph[0] -= floorf(v->oph[0]);
        for (int k = 1; k < v->nosc; k++) { float dt = f * v->orat[k] * ISR; out += osc(v->otype[k], v->oph[k], dt) * v->ogain[k]; v->oph[k] += dt; v->oph[k] -= floorf(v->oph[k]); }
        if (v->idxStage == 1) { v->idx += v->idxInc; if (--v->idxN <= 0) v->idxStage = 2; }
        else v->idx += (v->idxTarget - v->idx) * v->idxCoef;
    } else if (v->nosc > 0) {
        float sum = 0;
        for (int k = 0; k < v->nosc; k++) { float dt = f * v->orat[k] * ISR; if (dt > 0.49f) dt = 0.49f; sum += osc(v->otype[k], v->oph[k], dt) * v->ogain[k]; v->oph[k] += dt; if (v->oph[k] >= 1.0f) v->oph[k] -= 1.0f; }
        if (s->eng == CP_ENG_PAD) {
            if (s->nformant > 0) { float y = 0; for (int i = 0; i < s->nformant && i < 3; i++) y += bq_run(&v->bp[i], sum) * v->bpg[i]; sum = y; }
            else if (s->lp > 0) sum = bq_run(&v->lp, sum);
            if (s->breath > 0) sum += bq_run(&v->nbp, frand(&v->rng)) * s->breath;
        }
        out += sum;
    }
    /* envelope */
    switch (v->stage) {
        case 1: v->env += v->ainc; if (v->env >= v->peak) { v->env = v->peak; v->stage = 2; } break;
        case 2: v->env += (v->peak * v->sus - v->env) * v->dcoef; if (v->pluck && v->env < v->peak * 0.00015f) v->active = 0; break;
        case 3: v->env -= v->env * v->rcoef; if (v->env < 0.00002f) v->active = 0; break;
    }
    return out * v->env;
}

static inline float render_drum(dvoice_t *d) {
    float x;
    if (d->kind == 1) x = bq_run(&d->filt, frand(&d->rng));
    else { float dt = d->f * ISR; x = osc(d->wave, d->ph, dt); d->ph += dt; if (d->ph >= 1) d->ph -= 1; if (d->fN > 0) { d->f *= d->fmul; d->fN--; } if (d->kind == 2) x = bq_run(&d->filt, x); }
    if (d->attN > 0) { d->amp += d->ainc; d->attN--; } else d->amp *= d->dmul;
    if (--d->life <= 0) d->active = 0;
    return x * d->amp;
}

static float fdelay_read(const float *b, int n, int w, float delaySamples) {
    float rp = (float)w - delaySamples; while (rp < 0) rp += n;
    int i0 = (int)rp; float fr = rp - i0; int i1 = (i0 + 1) % n; return b[i0 % n] * (1 - fr) + b[i1] * fr;
}

void cp_render(float *outL, float *outR, int frames, double hostTime) {
    struct timespec t0; clock_gettime(CLOCK_MONOTONIC, &t0);
    /* drain the ring into the pending list */
    unsigned t = atomic_load_explicit(&rbTail, memory_order_relaxed), h = atomic_load_explicit(&rbHead, memory_order_acquire);
    while (t != h && npend < PENDING) { PEND[npend++] = RB[t % RING]; t++; }
    atomic_store_explicit(&rbTail, t, memory_order_release);

    for (int base = 0; base < frames; base += SUB) {
        int n = frames - base < SUB ? frames - base : SUB;
        double subStart = hostTime + base / SR, subEnd = subStart + n / SR;
        /* due events */
        int w = 0;
        for (int i = 0; i < npend; i++) {
            cp_event_t *e = &PEND[i]; if (!e->type) continue;
            if (e->time <= 0 || e->time < subEnd) { int dl = e->time > subStart ? (int)((e->time - subStart) * SR) : 0; exec_now(e, dl); }
            else PEND[w++] = *e;
        }
        npend = w;
        /* control-rate updates */
        for (int ci = 0; ci < CP_MAX_CH; ci++) {
            chan_t *c = &C[ci]; if (!c->used) continue;
            memset(c->busL, 0, sizeof c->busL); memset(c->busR, 0, sizeof c->busR); memset(c->drL, 0, sizeof c->drL); memset(c->drR, 0, sizeof c->drR);
            c->lvib += 5.2f * n * ISR; c->lvib -= floorf(c->lvib);
            c->vibCents = sinf(TWO_PI * c->lvib) * c->p.vibrato * 40.0f;
            float cut = clampf(c->p.cutoff * (c->p.snd.cut > 0 ? c->p.snd.cut : 1.0f), 40, 20000);
            if (fabsf(cut - c->cutoffApplied) > 0.5f) { bq_set(&c->fL, 0, cut, 0.8f); bq_set(&c->fR, 0, cut, 0.8f); c->cutoffApplied = cut; }
            c->any = 0;
        }
        /* voices */
        for (int vi = 0; vi < CP_MAX_VOICES; vi++) {
            voice_t *v = &V[vi]; if (!v->active) continue;
            chan_t *c = &C[v->ch]; if (!c->used) { v->active = 0; continue; }
            if (v->offTime < 0) { v->offTime += n; if (v->offTime >= 0) { v->offTime = 0; release_voice(v); } }
            float vibMul = c->p.vibrato > 0 ? powf(2.0f, c->vibCents / 1200.0f) : 1.0f;
            /* pad filter modulation */
            if (v->snd.eng == CP_ENG_PAD && v->snd.nformant == 0 && v->snd.lp > 0 && (v->snd.fenv > 0 || v->snd.lfoFilt > 0)) {
                float fc = v->lpBase;
                if (v->snd.fenv > 0) { float tt = (float)v->fenvN / (float)SR; fc += tt < 0.08f ? v->snd.fenv * (tt / 0.08f) : v->snd.fenv * expf(-(tt - 0.08f) / 0.35f); }
                if (v->snd.lfoFilt > 0) { v->lfoPh += v->snd.lfoFilt * n * ISR; v->lfoPh -= floorf(v->lfoPh); fc += v->lpBase * 0.6f * sinf(TWO_PI * v->lfoPh); }
                bq_set(&v->lp, 0, fmaxf(30.0f, fc), 1.5f); v->fenvN += n;
            }
            for (int i = 0; i < n; i++) {
                if (v->delay > 0) { v->delay--; continue; }
                if (v->stage == 0) v->stage = 1;
                float x = render_voice(v, vibMul);
                c->busL[i] += x * v->panL; c->busR[i] += x * v->panR;
                if (!v->active) break;
            }
            c->any = 1;
        }
        /* drums (ch < 0 = metronome click straight to master) */
        for (int di = 0; di < CP_MAX_DRUMS; di++) {
            dvoice_t *d = &D[di]; if (!d->active) continue;
            float *L = d->ch < 0 ? CLICKBUF : C[d->ch].drL, *Rr = d->ch < 0 ? NULL : C[d->ch].drR;
            for (int i = 0; i < n; i++) {
                if (d->delay > 0) { d->delay--; continue; }
                float x = render_drum(d); L[i] += x; if (Rr) Rr[i] += x;
                if (!d->active) break;
            }
        }
        /* channel FX + mix */
        float mixL[SUB] = { 0 }, mixR[SUB] = { 0 }, rev[SUB] = { 0 }, dly[SUB] = { 0 };
        for (int ci = 0; ci < CP_MAX_CH; ci++) {
            chan_t *c = &C[ci]; if (!c->used) continue;
            const cp_patch_t *p = &c->p;
            float ch = p->chorus, fl = p->flanger, dry = 1.0f - fmaxf(ch, fl) * 0.35f, tr = p->tremolo;
            for (int i = 0; i < n; i++) {
                float l = bq_run(&c->fL, c->busL[i]), r = bq_run(&c->fR, c->busR[i]);
                float mono = (l + r) * 0.5f;
                /* chorus: two modulated taps panned L/R */
                c->cbuf[c->cw] = mono;
                c->lc1 += 0.6f * ISR; if (c->lc1 >= 1) c->lc1 -= 1; c->lc2 += 0.97f * ISR; if (c->lc2 >= 1) c->lc2 -= 1;
                float t1 = fdelay_read(c->cbuf, 4096, c->cw, (0.018f + 0.004f * sinf(TWO_PI * c->lc1)) * (float)SR);
                float t2 = fdelay_read(c->cbuf, 4096, c->cw, (0.025f + 0.004f * sinf(TWO_PI * c->lc2)) * (float)SR);
                c->cw = (c->cw + 1) & 4095;
                /* flanger with feedback */
                c->lfl += 0.25f * ISR; if (c->lfl >= 1) c->lfl -= 1;
                float fd = fdelay_read(c->fbuf, 2048, c->fwi, fmaxf(1.0f, (0.003f + 0.0025f * sinf(TWO_PI * c->lfl)) * (float)SR));
                c->fbuf[c->fwi] = mono + fd * 0.6f; c->fwi = (c->fwi + 1) & 2047;
                /* pan -0.7 / +0.7 → L gains */
                const float PL = 0.2334f, PR = 0.9724f;
                float oL = l * dry + (t1 * PR + t2 * PL) * ch * 0.8f + fd * fl * 0.7f;
                float oR = r * dry + (t1 * PL + t2 * PR) * ch * 0.8f + fd * fl * 0.7f;
                c->ltr += p->tremRate * ISR; if (c->ltr >= 1) c->ltr -= 1;
                float tg = 1.0f - tr * 0.5f + tr * 0.5f * sinf(TWO_PI * c->ltr);
                c->gate += (c->gateT - c->gate) * 0.0015f;
                float g = tg * c->gate * p->level;
                oL *= g; oR *= g;
                float dL = c->drL[i] * c->gate * 0.9f, dR = c->drR[i] * c->gate * 0.9f;
                mixL[i] += oL + dL; mixR[i] += oR + dR;
                rev[i] += (oL + oR) * 0.5f * p->reverb * 0.9f + (dL + dR) * 0.5f * 0.12f;
                dly[i] += (oL + oR) * 0.5f * p->delay * 0.7f;
            }
        }
        /* global delay → reverb → master */
        for (int i = 0; i < n; i++) {
            dlyTime += (dlyTimeT - dlyTime) * 0.0005f;
            float y = fdelay_read(DLY, DLYN, DLYW, dlyTime * (float)SR);
            dlyLP += (y - dlyLP) * (1.0f - expf(-TWO_PI * 3500.0f * ISR));
            DLY[DLYW] = dly[i] + dlyLP * 0.38f; DLYW = (DLYW + 1) % DLYN;
            float rin = (rev[i] + dlyLP) * 0.015f * 3.0f, rl = 0, rr = 0;
            for (int k = 0; k < NCOMB; k++) {
                comb_t *a = &CL[k], *b = &CR[k];
                float oa = a->b[a->i]; a->store = oa * 0.8f + a->store * 0.2f; a->b[a->i] = rin + a->store * 0.84f; if (++a->i >= a->n) a->i = 0; rl += oa;
                float ob = b->b[b->i]; b->store = ob * 0.8f + b->store * 0.2f; b->b[b->i] = rin + b->store * 0.84f; if (++b->i >= b->n) b->i = 0; rr += ob;
            }
            for (int k = 0; k < NAP; k++) {
                ap_t *a = &AL[k], *b = &AR[k];
                float ba = a->b[a->i]; a->b[a->i] = rl + ba * 0.5f; rl = ba - rl; if (++a->i >= a->n) a->i = 0;
                float bb = b->b[b->i]; b->b[b->i] = rr + bb * 0.5f; rr = bb - rr; if (++b->i >= b->n) b->i = 0;
            }
            float L = mixL[i] + dlyLP + rl * 0.9f + CLICKBUF[i], R = mixR[i] + dlyLP + rr * 0.9f + CLICKBUF[i];
            CLICKBUF[i] = 0;
            masterVol += (masterVolT - masterVol) * 0.001f;
            L *= masterVol; R *= masterVol;
            float pk = fmaxf(fabsf(L), fabsf(R));
            limEnv = pk > limEnv ? limEnv + (pk - limEnv) * 0.3f : limEnv * 0.99992f;
            float thr = 0.5f, g = 1.0f;
            if (limEnv > thr) g = (thr + (limEnv - thr) / 12.0f) / limEnv;
            L = tanhf(L * g * 1.05f) * 0.95f; R = tanhf(R * g * 1.05f) * 0.95f;
            outL[base + i] = L; outR[base + i] = R;
            int sw = atomic_load_explicit(&scopeW, memory_order_relaxed); SCOPE[sw] = (L + R) * 0.5f; atomic_store_explicit(&scopeW, (sw + 1) % SCOPE_N, memory_order_relaxed);
        }
    }
    struct timespec t1; clock_gettime(CLOCK_MONOTONIC, &t1);
    double el = (t1.tv_sec - t0.tv_sec) + (t1.tv_nsec - t0.tv_nsec) * 1e-9;
    LOAD = (float)(el / (frames / SR));
}

void cp_scope(float *dst, int n) {
    if (n > SCOPE_N) n = SCOPE_N;
    int w = atomic_load_explicit(&scopeW, memory_order_relaxed);
    for (int i = 0; i < n; i++) dst[i] = SCOPE[(w - n + i + SCOPE_N) % SCOPE_N];
}
float cp_last_load(void) { return LOAD; }
