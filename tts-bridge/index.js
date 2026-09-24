const DEFAULT_OPTIONS = Object.freeze({
  source: 'tts-bridge',
  language: 'en-US',
  rate: 1,
  pitch: 1,
  volume: 1,
  dedupeWindowMs: 1500,
  cleanupDelayMs: 0,
  nativeBridgeName: 'ReactNativeWebView',
  preferNative: true,
});

export const TTS_MESSAGE_TYPES = Object.freeze({
  SPEAK: 'TTS_SPEAK',
  STOP: 'TTS_STOP',
});

function clamp(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    rate: clamp(options.rate, 0.1, 10, DEFAULT_OPTIONS.rate),
    pitch: clamp(options.pitch, 0, 2, DEFAULT_OPTIONS.pitch),
    volume: clamp(options.volume, 0, 1, DEFAULT_OPTIONS.volume),
    dedupeWindowMs: Math.max(0, options.dedupeWindowMs ?? DEFAULT_OPTIONS.dedupeWindowMs),
    cleanupDelayMs: Math.max(0, options.cleanupDelayMs ?? DEFAULT_OPTIONS.cleanupDelayMs),
  };
}

export class TtsBridge {
  constructor(options = {}) {
    this.options = normalizeOptions(options);
    this.enabled = options.enabled ?? true;
    this.lastSpokenText = '';
    this.lastSpokenAt = 0;
    this.pendingStop = null;
    this.requestSequence = 0;
  }

  getWindow() {
    return typeof window === 'undefined' ? undefined : window;
  }

  getNativeBridge() {
    const browserWindow = this.getWindow();
    if (!browserWindow || !this.options.preferNative) return undefined;

    const bridge = browserWindow[this.options.nativeBridgeName];
    return bridge && typeof bridge.postMessage === 'function' ? bridge : undefined;
  }

  getTransport() {
    if (this.getNativeBridge()) return 'native';

    const browserWindow = this.getWindow();
    if (browserWindow && 'speechSynthesis' in browserWindow && typeof SpeechSynthesisUtterance !== 'undefined') {
      return 'web';
    }

    return 'none';
  }

  isSupported() {
    return this.getTransport() !== 'none';
  }

  cancelPendingStop() {
    const browserWindow = this.getWindow();
    if (this.pendingStop !== null && browserWindow) {
      browserWindow.clearTimeout(this.pendingStop);
    }
    this.pendingStop = null;
  }

  createRequestId() {
    this.requestSequence += 1;
    return `${Date.now()}-${this.requestSequence}`;
  }

  postNative(message) {
    const bridge = this.getNativeBridge();
    if (!bridge) return false;

    bridge.postMessage(JSON.stringify(message));
    return true;
  }

  speak(text, overrides = {}) {
    const browserWindow = this.getWindow();
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    if (!this.enabled || !browserWindow || !normalizedText) return false;

    this.cancelPendingStop();

    const now = Date.now();
    if (
      normalizedText === this.lastSpokenText
      && now - this.lastSpokenAt < this.options.dedupeWindowMs
    ) {
      return false;
    }

    const speechOptions = normalizeOptions({ ...this.options, ...overrides });
    const requestId = this.createRequestId();
    this.lastSpokenText = normalizedText;
    this.lastSpokenAt = now;

    if (this.postNative({
      source: this.options.source,
      type: TTS_MESSAGE_TYPES.SPEAK,
      requestId,
      payload: {
        text: normalizedText,
        language: speechOptions.language,
        rate: speechOptions.rate,
        pitch: speechOptions.pitch,
        volume: speechOptions.volume,
      },
    })) {
      return true;
    }

    if (this.getTransport() !== 'web') return false;

    browserWindow.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.lang = speechOptions.language;
    utterance.rate = speechOptions.rate;
    utterance.pitch = speechOptions.pitch;
    utterance.volume = speechOptions.volume;

    const voices = browserWindow.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => voice.lang === speechOptions.language)
      ?? voices.find(voice => voice.lang.startsWith(speechOptions.language.split('-')[0]))
      ?? null;

    browserWindow.speechSynthesis.speak(utterance);
    return true;
  }

  stop() {
    const browserWindow = this.getWindow();
    if (!browserWindow) return false;

    this.cancelPendingStop();
    this.lastSpokenText = '';
    this.lastSpokenAt = 0;
    const requestId = this.createRequestId();

    if (this.postNative({
      source: this.options.source,
      type: TTS_MESSAGE_TYPES.STOP,
      requestId,
    })) {
      return true;
    }

    if (this.getTransport() !== 'web') return false;
    browserWindow.speechSynthesis.cancel();
    return true;
  }

  stopAfterCleanup() {
    const browserWindow = this.getWindow();
    if (!browserWindow) return;

    this.cancelPendingStop();
    this.pendingStop = browserWindow.setTimeout(() => {
      this.pendingStop = null;
      this.stop();
    }, this.options.cleanupDelayMs);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stop();
  }

  configure(options = {}) {
    this.options = normalizeOptions({ ...this.options, ...options });
  }

  destroy() {
    this.stop();
    this.enabled = false;
  }
}

export function createTtsBridge(options = {}) {
  return new TtsBridge(options);
}
