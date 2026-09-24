const AnalyticsManager = require('../dist/analytics-bridge.js');

// Mock window and ReactNativeWebView
global.window = {
  ReactNativeWebView: {
    postMessage: jest.fn()
  }
};

describe('AnalyticsManager', () => {
  let analytics;
  
  beforeEach(() => {
    // Use the singleton instance or create new one
    // Since we exported the class, we can instantiate it
    analytics = new AnalyticsManager();
    
    // Clear mock
    global.window.ReactNativeWebView.postMessage.mockClear();
  });
  
  test('should initialize correctly', () => {
    analytics.initialize('game_123', 'session_456');
    const data = analytics.getReportData();
    
    expect(data.gameId).toBe('game_123');
    expect(data.name).toBe('session_456');
    expect(data.xpEarnedTotal).toBe(0);
  });
  
  test('should add raw metrics', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.addRawMetric('fps', '60');
    
    const data = analytics.getReportData();
    expect(data.rawData).toHaveLength(1);
    expect(data.rawData[0].key).toBe('fps');
    expect(data.rawData[0].value).toBe('60');
  });
  
  test('should track levels correctly', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1');
    analytics.endLevel('level_1', true, 5000, 100);
    
    const data = analytics.getReportData();
    expect(data.diagnostics.levels).toHaveLength(1);
    expect(data.diagnostics.levels[0].successful).toBe(true);
    expect(data.xpEarnedTotal).toBe(100);
  });
  
  test('should record tasks', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1');
    analytics.recordTask('level_1', 'q1', 'What is 2+2?', '4', '4', 1000, 10);
    
    const data = analytics.getReportData();
    const level = data.diagnostics.levels[0];
    expect(level.tasks).toHaveLength(1);
    expect(level.tasks[0].successful).toBe(true);
  });

  test('should submit report to React Native', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.submitReport();
    
    expect(global.window.ReactNativeWebView.postMessage).toHaveBeenCalled();
    const payload = JSON.parse(global.window.ReactNativeWebView.postMessage.mock.calls[0][0]);
    expect(payload.gameId).toBe('game_123');
  });

  test('should track highestLevelPlayed correctly', () => {
    analytics.initialize('game_123', 'session_456');
    expect(analytics.getReportData().highestLevelPlayed).toBe(0);

    // Start level 1
    analytics.startLevel(1);
    expect(analytics.getReportData().highestLevelPlayed).toBe(1);

    // Start level 5 (increase)
    analytics.startLevel('5');
    expect(analytics.getReportData().highestLevelPlayed).toBe(5);

    // Start level 2 (should stay 5)
    analytics.startLevel(2);
    expect(analytics.getReportData().highestLevelPlayed).toBe(5);

    // Start non-numeric (should reset to 0)
    analytics.startLevel('bonus_stage');
    expect(analytics.getReportData().highestLevelPlayed).toBe(0);
  });

  test('should submit one level payload with game-provided runId', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel(3);
    analytics.recordTask(3, 'q1', 'What is 2+2?', '4', '4', 1000, 10);
    analytics.endLevel(3, true, 5000, 80);

    const payload = analytics.submitLevel(3, { runId: 'run-143' });

    expect(global.window.ReactNativeWebView.postMessage).toHaveBeenCalled();
    const sentPayload = JSON.parse(global.window.ReactNativeWebView.postMessage.mock.calls[0][0]);
    expect(sentPayload).toEqual(expect.objectContaining({
      gameId: 'game_123',
      name: 'session_456',
      runId: 'run-143',
      highestLevelPlayed: 3,
      xpEarned: 80,
      xpEarnedTotal: 80
    }));
    expect(sentPayload.level).toEqual(expect.objectContaining({
      levelId: '3',
      levelNumber: 3,
      successful: true,
      timeTaken: 5000,
      xpEarned: 80
    }));
    expect(sentPayload.level.tasks).toHaveLength(1);
    expect(sentPayload.diagnostics.levels).toHaveLength(1);
    expect(sentPayload.diagnostics.levels[0].levelNumber).toBe(3);
    expect(payload.runId).toBe('run-143');
  });

  test('should use the runId passed for each level submit', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel(1);
    analytics.endLevel(1, true, 2500, 20);

    analytics.submitLevel(1, { runId: 'run-late' });

    const sentPayload = JSON.parse(global.window.ReactNativeWebView.postMessage.mock.calls[0][0]);
    expect(sentPayload.runId).toBe('run-late');
  });

  test('should validate level payload and not send without runId', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel(1);
    analytics.endLevel(1, true, 2500, 20);

    const result = analytics.submitLevel(1);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('runId is required and must be provided by the game');
    expect(global.window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
  });

  test('should require numeric levelNumber for level-wise submits', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1');
    analytics.endLevel('level_1', true, 2500, 20);

    const result = analytics.submitLevel('level_1', { runId: 'run-143' });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('level.levelNumber must be a positive number');
    expect(global.window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
  });

  test('should accept explicit levelNumber for non-numeric game level ids', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1', { levelNumber: 1 });
    analytics.endLevel('level_1', true, 2500, 20);

    analytics.submitLevel('level_1', { runId: 'run-143' });

    const sentPayload = JSON.parse(global.window.ReactNativeWebView.postMessage.mock.calls[0][0]);
    expect(sentPayload.highestLevelPlayed).toBe(1);
    expect(sentPayload.level).toEqual(expect.objectContaining({
      levelId: 'level_1',
      levelNumber: 1,
      xpEarned: 20
    }));
  });

  test('should not submit unfinished level payloads', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel(1);

    const result = analytics.submitLevel(1, { runId: 'run-143' });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('level.completed must be true before submit');
    expect(global.window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
  });

  test('should validate rawData schema', () => {
    const level = {
      levelId: '1',
      levelNumber: 1,
      completed: true,
      successful: true,
      timeTaken: 1000,
      xpEarned: 10,
      tasks: []
    };
    const validation = analytics.validateLevelPayload({
      gameId: 'game_123',
      name: 'session_456',
      runId: 'run-143',
      highestLevelPlayed: 1,
      level,
      xpEarned: 10,
      xpEarnedTotal: 10,
      rawData: [{ key: '', value: 60 }],
      diagnostics: { levels: [level] },
      timestamp: new Date().toISOString()
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('rawData[0].key is required');
    expect(validation.errors).toContain('rawData[0].value must be a string');
  });

  test('should validate task schema', () => {
    const level = {
      levelId: '1',
      levelNumber: 1,
      completed: true,
      successful: true,
      timeTaken: 1000,
      xpEarned: 10,
      tasks: [{ taskId: '', successful: 'yes', timeTaken: -1, xpEarned: -5 }]
    };
    const validation = analytics.validateLevelPayload({
      gameId: 'game_123',
      name: 'session_456',
      runId: 'run-143',
      highestLevelPlayed: 1,
      level,
      xpEarned: 10,
      xpEarnedTotal: 10,
      rawData: [],
      diagnostics: { levels: [level] },
      timestamp: new Date().toISOString()
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('level.tasks[0].taskId is required');
    expect(validation.errors).toContain('level.tasks[0].successful must be a boolean');
    expect(validation.errors).toContain('level.tasks[0].timeTaken must be a non-negative number');
    expect(validation.errors).toContain('level.tasks[0].xpEarned must be a non-negative number');
  });

  test('should require diagnostics to contain exactly the submitted level', () => {
    const level = {
      levelId: '1',
      levelNumber: 1,
      completed: true,
      successful: true,
      timeTaken: 1000,
      xpEarned: 10,
      tasks: []
    };
    const validation = analytics.validateLevelPayload({
      gameId: 'game_123',
      name: 'session_456',
      runId: 'run-143',
      highestLevelPlayed: 1,
      level,
      xpEarned: 10,
      xpEarnedTotal: 10,
      rawData: [],
      diagnostics: { levels: [level, { ...level, levelNumber: 2 }] },
      timestamp: new Date().toISOString()
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('diagnostics.levels must contain exactly one level');
  });
});
