// Chord Pocket native synth engine (C, real-time safe).
// The render function runs on the audio thread; events arrive from the UI thread
// through a lock-free single-producer/single-consumer ring.
#ifndef CPSYNTH_H
#define CPSYNTH_H
#ifdef __cplusplus
extern "C" {
#endif

#define CP_MAX_CH      16
#define CP_MAX_VOICES  96
#define CP_MAX_DRUMS   64
#define CP_MAX_OSC     8

enum { CP_ENG_ANALOG = 0, CP_ENG_FM = 1, CP_ENG_RENDER = 2, CP_ENG_SAMPLE = 3, CP_ENG_PAD = 4 };
enum { CP_WAVE_SINE = 0, CP_WAVE_TRI = 1, CP_WAVE_SAW = 2, CP_WAVE_SQUARE = 3 };
enum { CP_KIND_PIANO = 0, CP_KIND_HARP, CP_KIND_GUITAR, CP_KIND_VIBES, CP_KIND_SHUTTER, CP_KIND_COUNT };

typedef struct {
    int   eng, wave, kind;
    int   nwaves; int waves[3]; float det[3]; float mix[3];
    float lp, fenv, lfoFilt, breath, cut; int oct;
    int   nformant; float formant[3];
    float ratio, index, idxDecay, idxAttack, idxPeak, tine, ratio2;
} cp_sound_t;

typedef struct {
    cp_sound_t snd;
    float a, d, s, r;          // envelope (seconds, sustain level)
    float level;
    float reverb, delay, chorus, flanger, tremolo, tremRate, vibrato, cutoff, glide, stereo;
    int   voices;              // unison count 1/2/4/8
} cp_patch_t;

enum {
    CP_EV_NOTE_ON = 1, CP_EV_NOTE_OFF, CP_EV_GLIDE, CP_EV_PATCH, CP_EV_GATE,
    CP_EV_DRUM, CP_EV_KILL, CP_EV_VOLUME, CP_EV_DELAYTIME, CP_EV_CLICK
};

typedef struct {
    int    type;
    int    ch;
    int    id;          // voice id (note on/off/glide)
    float  midi, vel;
    float  glideFrom;   // < 0 = none
    double time;        // host seconds (CACurrentMediaTime clock); <= 0 means "now"
    int    drum, kit;
    float  value;       // gate / volume / delay time / click accent
    cp_patch_t patch;   // CP_EV_PATCH
} cp_event_t;

// lifecycle
void   cp_init(double sampleRate);
double cp_sample_rate(void);
// UI thread: queue an event (returns 0 if the ring is full)
int    cp_push(const cp_event_t *ev);
// audio thread: render interleaved-free stereo; hostTime = host seconds of the first sample
void   cp_render(float *outL, float *outR, int frames, double hostTime);
// background thread: build the decaying-instrument table for one note (idempotent)
void   cp_prerender(int kind, int midi);
int    cp_is_rendered(int kind, int midi);
// user sample (mono). Ownership passes to the engine; the previous buffer is returned
// so the caller can free it later (after the audio thread stops using it).
float *cp_set_user_sample(float *data, int length, double sampleRate, float rootHz);
// oscilloscope tap: copies the most recent n output samples (mono) into dst
void   cp_scope(float *dst, int n);
// load estimate 0..1 of last render call (for diagnostics)
float  cp_last_load(void);

#ifdef __cplusplus
}
#endif
#endif
