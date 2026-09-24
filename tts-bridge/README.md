# Universal TTS Bridge

A small, dependency-free ES module for browser speech and React Native WebView TTS. It contains no game state, dialogue text, UI, scoring, or framework code.

> Treat this folder as shared infrastructure. Do not add or modify game-specific behavior here. Keep dialogue selection, timing, mute UI, and gameplay state in each game.

## Features

- Plain ES module usable from Vanilla JS, React, and TypeScript.
- Automatically prefers `window.ReactNativeWebView.postMessage` when available.
- Falls back to the browser Web Speech API.
- Safe when rendered on a server or unsupported browser.
- Configurable language, rate, pitch, volume, source, and native bridge name.
- Prevents rapid duplicate utterances.
- Supports deferred cleanup for React StrictMode.
- Adds request IDs to native messages.
- Supports enable, disable, stop, reconfigure, and destroy operations.

## Files

- `index.js`: implementation.
- `index.d.ts`: TypeScript declarations.
- `COMMON_MISTAKES.md`: lifecycle and integration pitfalls.

## Basic usage

```js
import { createTtsBridge } from './tts-bridge/index.js';

const tts = createTtsBridge({
  source: 'my-game',
  language: 'en-US',
  rate: 0.95,
  pitch: 1.05,
  volume: 0.8,
});

tts.speak('Welcome to the game!');
tts.stop();
tts.setEnabled(false);
```

`source` identifies your application to the native host. It must be configured by the game, not hard-coded into the plugin.

## Vanilla JS

```js
const button = document.querySelector('#speak');
button.addEventListener('click', () => {
  tts.speak('Choose the matching shape.');
});

window.addEventListener('pagehide', () => tts.stop());
```

## React

Create one bridge outside the component so renders do not create new instances:

```tsx
import { useEffect } from 'react';
import { createTtsBridge } from './tts-bridge/index.js';

const tts = createTtsBridge({ source: 'my-react-game' });

export function Dialogue({ text }: { text: string }) {
  useEffect(() => {
    tts.speak(text);
    return () => tts.stopAfterCleanup();
  }, [text]);

  return <p>{text}</p>;
}
```

Use `stopAfterCleanup()` in effect cleanup. Its deferred stop is canceled by React StrictMode's immediate effect replay, preventing `SPEAK -> STOP -> SPEAK` duplicates. Use `stop()` for real user actions such as mute, close, pause, or leaving the game.

## TypeScript

The adjacent declaration file provides types automatically:

```ts
import { createTtsBridge, type TtsSpeechOptions } from './tts-bridge/index.js';

const defaults: TtsSpeechOptions = { language: 'en-IN', rate: 0.9 };
const tts = createTtsBridge({ source: 'science-game', ...defaults });
```

## React Native WebView

Install native dependencies in the host app:

```bash
npm install react-native-webview react-native-tts
```

The game sends JSON through `window.ReactNativeWebView.postMessage`:

```json
{
  "source": "my-game",
  "type": "TTS_SPEAK",
  "requestId": "timestamp-sequence",
  "payload": {
    "text": "Welcome!",
    "language": "en-US",
    "rate": 0.95,
    "pitch": 1.05,
    "volume": 0.8
  }
}
```

The stop message contains `source`, `type: "TTS_STOP"`, and `requestId`.

Example native receiver:

```tsx
import Tts from 'react-native-tts';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

async function onMessage({ nativeEvent }: WebViewMessageEvent) {
  let message;
  try {
    message = JSON.parse(nativeEvent.data);
  } catch {
    return;
  }

  if (message.source !== 'my-game') return;

  if (message.type === 'TTS_STOP') {
    await Tts.stop();
    return;
  }

  if (message.type !== 'TTS_SPEAK' || !message.payload?.text) return;

  const { text, language, rate, pitch, volume } = message.payload;

  // Flush the previous native utterance before starting the current dialogue.
  await Tts.stop();
  await Tts.setDefaultLanguage(language);
  await Tts.setDefaultRate(rate);
  await Tts.setDefaultPitch(pitch);
  Tts.speak(text, {
    androidParams: {
      KEY_PARAM_STREAM: 'STREAM_MUSIC',
      KEY_PARAM_VOLUME: volume,
      KEY_PARAM_PAN: 0,
    },
  });
}

export function GameWebView() {
  return (
    <WebView
      source={{ uri: 'https://example.com/game/' }}
      javaScriptEnabled
      onMessage={onMessage}
    />
  );
}
```

Stop TTS when the native app backgrounds or the WebView unmounts. The host remains responsible for installing/initializing its native TTS engine.

## API

- `createTtsBridge(options)`: creates an independent bridge instance.
- `speak(text, overrides?)`: speaks text; returns whether a transport accepted it.
- `stop()`: immediately stops and clears duplicate tracking.
- `stopAfterCleanup()`: deferred stop intended for React effect cleanup.
- `setEnabled(enabled)`: controls TTS; disabling stops active speech.
- `configure(options)`: updates defaults at runtime.
- `getTransport()`: returns `native`, `web`, or `none`.
- `isSupported()`: reports whether a transport exists.
- `destroy()`: stops speech and disables the instance.

## Transport selection

1. React Native WebView bridge, when available and `preferNative` is true.
2. Browser Web Speech API.
3. No-op fallback.

Set `preferNative: false` only when intentionally testing browser speech inside a WebView.
