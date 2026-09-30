// Native-only race: JS clock estimate a few ms ahead → note-on waits in the pending list,
// the immediate note-off (t=0) finds no voice → note never ends.
#include "../ios/ChordPocket/Engine/cpsynth.h"
#include <stdio.h>
#include <string.h>
#include <math.h>
int main(void) {
  cp_init(48000); float L[256], R[256]; double host = 100.0;
  cp_event_t e; memset(&e, 0, sizeof e);
  e.type = CP_EV_PATCH; e.ch = 0; e.patch.snd.eng = CP_ENG_ANALOG; e.patch.snd.wave = CP_WAVE_SAW;
  e.patch.a = 0.01f; e.patch.d = 0.3f; e.patch.s = 0.8f; e.patch.r = 0.3f; e.patch.level = 1; e.patch.cutoff = 20000; e.patch.voices = 1; cp_push(&e);
  cp_render(L, R, 256, host); host += 256 / 48000.0;
  for (int k = 0; k < 20; k++) {        // 20 quick taps
    memset(&e, 0, sizeof e); e.type = CP_EV_NOTE_ON; e.ch = 0; e.id = k + 1; e.midi = 60; e.vel = 0.8f; e.glideFrom = -1; e.time = host + 0.004; cp_push(&e);
    memset(&e, 0, sizeof e); e.type = CP_EV_NOTE_OFF; e.id = k + 1; e.time = 0; cp_push(&e);
    for (int b = 0; b < 4; b++) { cp_render(L, R, 256, host); host += 256 / 48000.0; }
  }
  for (int b = 0; b < 400; b++) { cp_render(L, R, 256, host); host += 256 / 48000.0; }   // ~2 s later
  double s = 0; for (int i = 0; i < 256; i++) s += L[i] * L[i];
  printf("rms 2s after 20 taps: %.4f  %s\n", sqrt(s / 256), sqrt(s / 256) > 0.001 ? "→ STUCK (bug reproduced)" : "→ silent (ok)");
  return 0;
}
