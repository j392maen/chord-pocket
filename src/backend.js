/* ===== Engine selection: native (iOS app) or Web Audio ===== */
const IS_NATIVE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cp);
const Engine = IS_NATIVE && typeof NativeEngine !== 'undefined' ? NativeEngine : AudioSys;
