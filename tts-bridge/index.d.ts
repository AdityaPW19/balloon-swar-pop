export type TtsTransport = 'native' | 'web' | 'none';

export interface TtsSpeechOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TtsBridgeOptions extends TtsSpeechOptions {
  source?: string;
  enabled?: boolean;
  dedupeWindowMs?: number;
  cleanupDelayMs?: number;
  nativeBridgeName?: string;
  preferNative?: boolean;
}

export interface TtsSpeakMessage {
  source: string;
  type: 'TTS_SPEAK';
  requestId: string;
  payload: Required<TtsSpeechOptions> & { text: string };
}

export interface TtsStopMessage {
  source: string;
  type: 'TTS_STOP';
  requestId: string;
}

export type TtsNativeMessage = TtsSpeakMessage | TtsStopMessage;

export declare const TTS_MESSAGE_TYPES: Readonly<{
  SPEAK: 'TTS_SPEAK';
  STOP: 'TTS_STOP';
}>;

export declare class TtsBridge {
  constructor(options?: TtsBridgeOptions);
  enabled: boolean;
  getTransport(): TtsTransport;
  isSupported(): boolean;
  speak(text: string, overrides?: TtsSpeechOptions): boolean;
  stop(): boolean;
  stopAfterCleanup(): void;
  setEnabled(enabled: boolean): void;
  configure(options?: TtsBridgeOptions): void;
  destroy(): void;
}

export declare function createTtsBridge(options?: TtsBridgeOptions): TtsBridge;
