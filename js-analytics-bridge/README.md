# JavaScript Analytics Bridge Plugin

A lightweight, framework-agnostic analytics bridge for JavaScript games to communicate with a React Native WebView host.

## Features

- **Session Management**: Track game sessions with unique IDs.
- **Run ID Forwarding**: Forward a game-generated `runId` with each level payload.
- **Level Tracking**: Monitor level start, completion, success status, and time taken.
- **Level-wise Submit**: Send one completed level at a time for backend XP progression.
- **Payload Validation**: Validate required analytics fields before sending to the host.
- **Task Recording**: Log individual user actions, questions, and choices within levels.
- **Raw Metrics**: Capture generic key-value metrics like FPS, latency, etc.
- **React Native Bridge**: Automatically detects and sends data to React Native WebView via `postMessage`.
- **Singleton Pattern**: Easy access across your game architecture.

## Installation

### NPM
```bash
npm install analytics-bridge-js
```

### Direct Script Include
Include the UMD build in your HTML:
```html
<script src="dist/analytics-bridge.min.js"></script>
```

## Usage

### Initialization
Initialize the analytics manager at the start of your game.

```javascript
import AnalyticsManager from 'analytics-bridge-js';

// Create instance
const analytics = new AnalyticsManager();
// OR use singleton
// const analytics = AnalyticsManager.getInstance();

// Game owns run identity. Create this when a new play run starts.
const runId = crypto.randomUUID();

// Initialize with Game ID and Session Name.
analytics.initialize('my_game_id', 'session_user_123');
```

### Tracking Levels
```javascript
// Start a numeric level. Numeric levels automatically update highestLevelPlayed.
analytics.startLevel(1);

// ... game play ...

// End a level (id, success, timeTakenMs, xpEarned)
analytics.endLevel(1, true, 45000, 100);

// Send only this level to the host/backend bridge.
analytics.submitLevel(1, { runId });
```

If your game uses string level ids, pass the numeric level number explicitly:

```javascript
analytics.startLevel('level_1', { levelNumber: 1 });
analytics.endLevel('level_1', true, 45000, 100);
analytics.submitLevel('level_1', { runId });
```

The level-wise payload sent by the bridge looks like:

```json
{
  "gameId": "my_game_id",
  "name": "session_user_123",
  "runId": "game-generated-uuid",
  "highestLevelPlayed": 1,
  "level": {
    "levelId": "1",
    "levelNumber": 1,
    "completed": true,
    "successful": true,
    "timeTaken": 45000,
    "xpEarned": 100,
    "tasks": []
  }
}
```

### Recording Tasks
Track specific interactions like answering a question.

```javascript
analytics.recordTask(
  'level_1',       // Level ID
  'task_01',       // Task ID
  'What is 2+2?',  // Question
  '4',             // Correct Choice
  '4',             // User Choice
  2000,            // Time taken (ms)
  10               // XP Earned
);
```

### Raw Metrics
Track performance or other custom data.

```javascript
analytics.addRawMetric('fps', '60');
analytics.addRawMetric('memory_usage', '128MB');
```

### Submitting Data
For the new backend XP system, use `submitLevel(levelId, { runId })` after each completed level. This sends one level only and requires a game-generated `runId`.

```javascript
analytics.submitLevel(1, { runId });
```

`submitReport()` is still available for legacy accumulated reports, but level-progress XP should use `submitLevel()`.

The bridge validates level-wise payloads before sending. It requires a game-provided `runId`, one completed level, numeric `levelNumber`, non-negative XP/time values, valid task objects, and valid raw metric objects.

### Game-Owned Run IDs
The bridge does not create `runId`. The game should:

- Generate one `runId` when a new continuous play run starts.
- Reuse the same `runId` for level 1, 2, 3 in that run.
- Generate a new `runId` when the user starts a new run or the game restarts.
- Pass the `runId` directly to every `submitLevel(levelId, { runId })` call.

```javascript
analytics.submitLevel(1, { runId });
```

## Framework Examples

### Phaser 3
```javascript
class GameScene extends Phaser.Scene {
  create() {
    this.analytics = new AnalyticsManager();
    this.analytics.initialize('phaser_game', 'session_1');
  }
  
  onLevelComplete() {
    this.analytics.endLevel(1, true, 5000, 100);
    this.analytics.submitLevel(1, { runId: this.currentRunId });
  }
}
```

### Vanilla JS
```javascript
const analytics = new AnalyticsManager(); // Global from script tag
analytics.initialize('canvas_game', 'session_1');
```

### React / React Native
```jsx
// npm install analytics-bridge-js
import AnalyticsManager from 'analytics-bridge-js';

const MyGameComponent = () => {
  // Use ref to keep the instance stable across renders
  const analytics = React.useRef(new AnalyticsManager());

  React.useEffect(() => {
    analytics.current.initialize('my_game', 'session_1');
  }, []);

  const finishLevel = () => {
    analytics.current.endLevel(1, true, 3000, 50);
    analytics.current.submitLevel(1, { runId });
  };

  return <button onClick={finishLevel}>Win Game</button>;
};
```

## Build

To build the project from source:

```bash
npm install
npm run build
```

This will generate:
- `dist/analytics-bridge.js` (UMD)
- `dist/analytics-bridge.min.js` (UMD Minified)
- `dist/analytics-bridge.esm.js` (ES Module)

## License
MIT
