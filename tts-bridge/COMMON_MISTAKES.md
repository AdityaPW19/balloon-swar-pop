# Common TTS integration mistakes

> Do not solve game-specific timing or state problems by modifying the shared plugin. Fix dialogue ownership and transitions in the game. Change this plugin only for transport-level behavior that benefits every application.

## Creating the bridge during render

Wrong:

```tsx
function Dialogue() {
  const tts = createTtsBridge();
}
```

This loses deduplication state and can create duplicate speech. Create one module-level instance or retain one instance with a ref.

## Calling `stop()` in React effect cleanup

React StrictMode replays effects in development. Immediate cleanup creates:

```text
SPEAK -> STOP -> SPEAK
```

Use `stopAfterCleanup()` in effect cleanup. Use immediate `stop()` for explicit mute, navigation, pause, or teardown actions.

## Remounting dialogue UI with stale text

Do not key a parent by level/question while it still holds the previous feedback text. React can mount the new subtree once with the old message and speak it again.

Update the persistent dialogue state before remounting, or avoid unnecessary keys on the dialogue subtree.

## Using TTS as game state

The bridge should only receive final text. It should not know levels, answers, hints, characters, scores, or feedback timing. Keep all selection and timing in the game.

## Queueing native speech

The native receiver should call `Tts.stop()` before `Tts.speak()` unless intentional queueing is desired. Otherwise old feedback may play after the next question appears.

## Ignoring stop messages

Handle `TTS_STOP` immediately in the React Native host. This message is used for mute, navigation, unmount, and interrupted dialogue.

## Replaying stale native callbacks

Native finish/cancel listeners may fire after a newer request starts. Track `requestId` if the host updates UI or audio ducking from callbacks, and ignore callbacks for superseded requests.

## Duplicating dedupe logic everywhere

The plugin handles rapid identical calls. Do not add arbitrary game delays solely to hide duplicate TTS. Native-side defensive deduplication is optional, but it should not replace correct game lifecycle behavior.

## Assuming a specific voice exists

Voice availability differs across browsers and Android devices. Configure a language, not a hard-coded voice name, and allow the platform to choose a fallback.

## Forgetting autoplay and user interaction rules

Some browsers delay speech until the user interacts with the page. Start spoken onboarding after a click/tap when targeting restrictive browsers.

## Coupling music and TTS unexpectedly

Keep music and dialogue settings separate unless the product explicitly combines them. Games may choose to bind dialogue to their SFX toggle, but that belongs in game code.

## Not stopping on lifecycle changes

On web, stop on navigation or `pagehide` when appropriate. In React Native, stop when the app backgrounds and when the WebView unmounts.

## Trusting arbitrary WebView messages

Parse JSON defensively and verify `source`, `type`, and payload fields before invoking native TTS. A host with multiple games should route each source intentionally.

## Editing the plugin for each game

Do not put dialogue arrays, UI labels, game IDs, answer rules, timers, or analytics in this folder. Configure `source` and speech defaults from each game's adapter module instead.
