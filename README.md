# Chord Pocket

HiChord に着想を得た、7つのダイアトニックコードキー＋8方向スティックのコード楽器。

- `src/` … Web アプリ本体（`python3 build.py` で `dist/chord-pocket.html` と `ios/ChordPocket/Web/index.html` を生成）
- `ios/` … iPhone アプリ（XcodeGen の `project.yml`、Swift、C 製シンセエンジン `Engine/cpsynth.c`）
- `test/` … C エンジンのテスト（`node gen_patches.js && clang -O2 -o harness harness.c ../ios/ChordPocket/Engine/cpsynth.c -lm && ./harness`）
- `.github/workflows/testflight.yml` … main に push すると macOS ランナーでビルドし TestFlight へアップロード

## 音声の方針
アプリ版は音をすべてアプリ内の C エンジンで合成し、`AVAudioSession(.playback, .mixWithOthers)` で鳴らします。
裏で再生中の音楽（YouTube Music など）を止めず、消音スイッチが ON でも鳴ります。
WKWebView の Web Audio はアプリの音声セッション設定を受け付けないため（WebKit bug 167788）、Web 版の音源はアプリでは使いません。

## 必要な Secrets
`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8`（App Store Connect API キー、Admin） / `TEAM_ID` / `BUNDLE_ID`

## フォントのライセンス
Zen Kaku Gothic New・Barlow Semi Condensed（SIL OFL 1.1）、PixelMplus（M+ FONT LICENSE）。`vendor/` 参照。
