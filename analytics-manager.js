import AnalyticsManager from './js-analytics-bridge/dist/analytics-bridge.esm.js';
import { GAME_CONFIG } from './game-config.js';
import { LEVELS_CONFIG } from './level-config.js';

/**
 * Educational Game 200-XP & Analytics Coordinator
 *
 * Core Invariants:
 * - TOTAL_CAMPAIGN_XP = 200 (Single source of truth)
 * - Dynamically distributes exactly 200 XP across N levels via Largest-Remainder Method
 * - Generates and manages stable runId (cleared on main-menu exit or restart)
 * - Prevents XP farming on level retry within the same run
 * - Synchronizes highestLevelPlayed between backend (window.BACKEND_PAYLOAD / URL params) and localStorage
 * - Submits level-wise analytics via the unaltered js-analytics-bridge
 */
export class GameAnalyticsCoordinator {
    constructor() {
        this.TOTAL_CAMPAIGN_XP = GAME_CONFIG.analytics?.totalCampaignXp || 200;
        this.bridge = AnalyticsManager.getInstance();

        this.gameId = GAME_CONFIG.analytics?.gameId || GAME_CONFIG.tts?.source || 'number-balloon-pop';
        this.sessionName = 'Session_' + Date.now();
        this.runId = null;
        this.levelStartTime = 0;
        this.highestLevelPlayed = 1;

        // Run-scoped awards to prevent farming within the same continuous run
        this.runLevelAwards = new Map(); // levelNumber -> awardedXp
        this.totalRunXpEarned = 0;

        // Progress sync listeners
        this.progressListeners = new Set();

        // Dynamically compute allocation table for current levels
        this.levelAllocation = this.computeDynamicAllocation(LEVELS_CONFIG);

        this.initialized = false;
    }

    /**
     * Helper to extract numeric level from any payload object or value
     * Supports: highestLevelPlayed, highestLevelCompleted (+1), level, currentLevel, startLevel, etc.
     * @param {*} obj
     * @returns {number|null}
     */
    extractLevel(obj) {
        if (!obj) return null;
        if (typeof obj === 'number' && !isNaN(obj) && obj > 0) {
            return Math.floor(obj);
        }
        if (typeof obj === 'string' && !isNaN(Number(obj)) && Number(obj) > 0) {
            return Math.floor(Number(obj));
        }
        if (typeof obj === 'object') {
            const played = obj.highestLevelPlayed ??
                           obj.highest_level_played ??
                           obj.unlockedLevel ??
                           obj.currentLevel ??
                           obj.startLevel ??
                           obj.level;
            if (typeof played === 'number' && !isNaN(played) && played > 0) {
                return Math.floor(played);
            }
            if (typeof played === 'string' && !isNaN(Number(played)) && Number(played) > 0) {
                return Math.floor(Number(played));
            }
            const completed = obj.highestLevelCompleted ?? obj.highest_level_completed;
            if (typeof completed === 'number' && !isNaN(completed) && completed >= 0) {
                return Math.floor(completed) + 1;
            }
            if (typeof completed === 'string' && !isNaN(Number(completed)) && Number(completed) >= 0) {
                return Math.floor(Number(completed)) + 1;
            }
        }
        return null;
    }

    /**
     * Largest-Remainder Method (Hamilton-Hare)
     * Distributes exactly 200 integer XP across N playable levels proportionally to level weights.
     * Guaranteed invariant: sum of all level maxXp === 200 for any level count >= 1.
     *
     * @param {Array} levels - Array of level configurations
     * @returns {Map<number, { maxXp: number, weight: number }>}
     */
    computeDynamicAllocation(levels = []) {
        const count = levels.length;
        if (count === 0) return new Map();

        const weights = levels.map(lvl => Math.max(1, lvl.xpWeight || 1));
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        // 1. Calculate exact fractional shares and integer base shares
        const shares = weights.map(w => (this.TOTAL_CAMPAIGN_XP * w) / totalWeight);
        const baseShares = shares.map(s => Math.floor(s));
        let allocated = baseShares.reduce((sum, s) => sum + s, 0);
        let remainder = this.TOTAL_CAMPAIGN_XP - allocated;

        // 2. Sort fractional parts descending with stable level-index tie-breaking
        const remainders = shares.map((s, idx) => ({
            index: idx,
            rem: s - baseShares[idx]
        })).sort((a, b) => b.rem - a.rem || a.index - b.index);

        // 3. Distribute remaining points
        for (let i = 0; i < remainder; i++) {
            baseShares[remainders[i].index] += 1;
        }

        // 4. Build map by 1-based levelNumber
        const allocation = new Map();
        levels.forEach((lvl, idx) => {
            const levelNum = lvl.level || (idx + 1);
            allocation.set(levelNum, {
                levelNumber: levelNum,
                maxXp: baseShares[idx],
                weight: weights[idx]
            });
        });

        return allocation;
    }

    /**
     * Get maximum XP allocated for a given level
     * @param {number} levelNumber
     * @returns {number}
     */
    getLevelMaxXp(levelNumber) {
        const item = this.levelAllocation.get(levelNumber);
        return item ? item.maxXp : Math.floor(this.TOTAL_CAMPAIGN_XP / Math.max(1, LEVELS_CONFIG.length));
    }

    /**
     * Subscribe to external/backend progress updates
     * @param {Function} callback
     */
    onProgressUpdated(callback) {
        if (typeof callback === 'function') {
            this.progressListeners.add(callback);
        }
    }

    /**
     * Notify all registered listeners of a new highestLevelPlayed
     * @param {number} newLevel
     */
    notifyProgressUpdated(newLevel) {
        this.progressListeners.forEach(cb => {
            try { cb(newLevel); } catch (e) { console.error('[AnalyticsCoordinator] Progress listener error:', e); }
        });
    }

    /**
     * Dynamically syncs incoming progress from Backend / Host WebView / Analytics Bridge
     * Updates highestLevelPlayed and local storage, and notifies the game engine
     * Inspired by CrossMath GameManager.syncProgress() and StorageManager.saveHighestLevel()
     *
     * @param {Object|number} payload - e.g. { highestLevelPlayed: 17 } or raw level number
     * @returns {boolean} Whether progress was updated
     */
    syncFromBackend(payload) {
        const incomingLevel = this.extractLevel(payload);
        if (!incomingLevel || incomingLevel <= 0) return false;

        const maxConfiguredLevel = LEVELS_CONFIG.length;
        const validLevel = Math.min(incomingLevel, maxConfiguredLevel);

        if (validLevel > this.highestLevelPlayed) {
            console.log(`[AnalyticsCoordinator] Auto-sync: Updating highestLevelPlayed: ${this.highestLevelPlayed} -> ${validLevel}`);
            this.highestLevelPlayed = validLevel;

            // 1. Update bridge reportData
            if (this.bridge && this.bridge._reportData) {
                this.bridge._reportData.highestLevelPlayed = validLevel;
            }

            // 2. Update local storage (both currentLevel and unlockedLevel updated to validLevel)
            if (typeof localStorage !== 'undefined') {
                try {
                    const saved = JSON.parse(localStorage.getItem(GAME_CONFIG.storageKey) || '{}');
                    saved.unlockedLevel = Math.max(saved.unlockedLevel || 1, validLevel);
                    saved.highestLevelPlayed = Math.max(saved.highestLevelPlayed || 1, validLevel);
                    saved.currentLevel = validLevel;
                    localStorage.setItem(GAME_CONFIG.storageKey, JSON.stringify(saved));
                    console.log(`[AnalyticsCoordinator] Auto-sync: Saved level ${validLevel} to local storage`);
                } catch (e) {
                    console.warn('[AnalyticsCoordinator] Failed to save synced level to localStorage:', e);
                }
            }

            // 3. Notify game listeners (so script.js updates state and UI live)
            this.notifyProgressUpdated(validLevel);
            return true;
        }

        return false;
    }

    /**
     * Setup auto-sync listeners for postMessage, window.userInfo setter, and focus/visibility changes
     */
    setupAutoSyncListeners() {
        if (typeof window === 'undefined') return;

        // Expose global methods on window for host WebView/React Native
        window.setBackendPayload = (payload) => this.syncFromBackend(payload);
        window.syncPlayerProgress = (payload) => this.syncFromBackend(payload);
        window.setGameProgress = (payload) => this.syncFromBackend(payload);
        window.gameAnalytics = this;

        // Dynamic interceptor for window.userInfo when injected by React Native WebView
        try {
            let _userInfo = window.userInfo;
            Object.defineProperty(window, 'userInfo', {
                configurable: true,
                enumerable: true,
                get: () => _userInfo,
                set: (val) => {
                    _userInfo = val;
                    console.log('[AnalyticsCoordinator] window.userInfo injected dynamically:', val);
                    this.syncFromBackend(val);
                }
            });
            if (_userInfo) {
                this.syncFromBackend(_userInfo);
            }
        } catch (_) {}

        // 1. Listen for postMessage from React Native WebView / parent frame / iframe
        window.addEventListener('message', (event) => {
            try {
                let data = event.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch (_) { return; }
                }
                if (!data || typeof data !== 'object') return;

                // Extract highestLevelPlayed from various possible message formats
                const possibleLevel = this.extractLevel(data) ??
                                      this.extractLevel(data.payload) ??
                                      this.extractLevel(data.data) ??
                                      this.extractLevel(data.userInfo);

                if (possibleLevel !== null) {
                    this.syncFromBackend({ highestLevelPlayed: possibleLevel });
                }
            } catch (e) {
                console.warn('[AnalyticsCoordinator] Error in message listener:', e);
            }
        });

        // 2. Periodic poll checks for delayed injection or direct mutations
        const checkPoints = [50, 150, 300, 600, 1200, 2500, 5000];
        checkPoints.forEach(delay => {
            setTimeout(() => {
                if (window.userInfo) this.syncFromBackend(window.userInfo);
                if (window.BACKEND_PAYLOAD) this.syncFromBackend(window.BACKEND_PAYLOAD);
                if (window.backendPayload) this.syncFromBackend(window.backendPayload);
            }, delay);
        });

        // 3. Auto-sync on window focus or visibility change (e.g. app returns from background)
        const checkBackgroundSync = () => {
            if (window.userInfo) this.syncFromBackend(window.userInfo);
            if (window.BACKEND_PAYLOAD) this.syncFromBackend(window.BACKEND_PAYLOAD);
            if (window.backendPayload) this.syncFromBackend(window.backendPayload);
        };

        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkBackgroundSync();
            }
        });
        window.addEventListener('focus', checkBackgroundSync);
    }

    /**
     * Initialize analytics and sync highestLevelPlayed with backend & localStorage
     * @param {Object} customBackendPayload - Optional backend payload
     * @returns {number} The resolved highestLevelPlayed
     */
    initialize(customBackendPayload = null) {
        if (!this.initialized) {
            this.bridge.initialize(this.gameId, this.sessionName);
            this.initialized = true;
            this.setupAutoSyncListeners();
        }

        // Synchronize highestLevelPlayed
        this.highestLevelPlayed = this.resolveHighestLevelPlayed(customBackendPayload);

        // Keep bridge report in sync
        if (this.bridge._reportData) {
            this.bridge._reportData.highestLevelPlayed = this.highestLevelPlayed;
        }

        console.log(`[AnalyticsCoordinator] Initialized. highestLevelPlayed: ${this.highestLevelPlayed}`);
        return this.highestLevelPlayed;
    }

    /**
     * Resolve highest level played from Backend payload, window.userInfo, URL parameters, and LocalStorage
     * Priority rule: Math.max(backend, local, 1). If backend has higher, update local storage.
     */
    resolveHighestLevelPlayed(customPayload = null) {
        let backendLevel = null;
        let localLevel = null;

        // 1. Direct custom payload
        if (customPayload) {
            backendLevel = this.extractLevel(customPayload);
        }

        // 2. window.userInfo (CrossMath primary pattern)
        if (!backendLevel && typeof window !== 'undefined') {
            backendLevel = this.extractLevel(window.userInfo);
        }

        // 3. Parent / top frame window.userInfo (if loaded in iframe)
        if (!backendLevel && typeof window !== 'undefined') {
            try {
                if (window.parent && window.parent !== window) {
                    backendLevel = this.extractLevel(window.parent.userInfo);
                }
            } catch (_) {}
            try {
                if (!backendLevel && window.top && window.top !== window) {
                    backendLevel = this.extractLevel(window.top.userInfo);
                }
            } catch (_) {}
        }

        // 4. window.BACKEND_PAYLOAD / window.backendPayload
        if (!backendLevel && typeof window !== 'undefined') {
            backendLevel = this.extractLevel(window.BACKEND_PAYLOAD) ||
                           this.extractLevel(window.backendPayload) ||
                           this.extractLevel(window.gameProgress) ||
                           this.extractLevel(window.playerProgress);
        }

        // 5. URL query parameters (e.g. ?highestLevelPlayed=17 or ?level=17)
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            try {
                const params = new URLSearchParams(window.location.search);
                const queryVal = params.get('highestLevelPlayed') ||
                                 params.get('highestLevelCompleted') ||
                                 params.get('level') ||
                                 params.get('currentLevel') ||
                                 params.get('startLevel');
                if (queryVal && !isNaN(Number(queryVal))) {
                    const parsed = Math.floor(Number(queryVal));
                    if (parsed > 0) {
                        backendLevel = Math.max(backendLevel || 0, parsed);
                    }
                }
            } catch (_) {}
        }

        // 6. Check LocalStorage
        if (typeof localStorage !== 'undefined') {
            try {
                const saved = JSON.parse(localStorage.getItem(GAME_CONFIG.storageKey) || '{}');
                const savedLevel = saved.unlockedLevel || saved.highestLevelPlayed || saved.currentLevel;
                if (typeof savedLevel === 'number' && !isNaN(savedLevel) && savedLevel > 0) {
                    localLevel = Math.floor(savedLevel);
                }
            } catch (_) {}
        }

        // Clamp to max configured levels
        const maxLevel = LEVELS_CONFIG.length;
        const resolved = Math.min(Math.max(backendLevel || 1, localLevel || 1, 1), maxLevel);

        // Keep local storage synchronized if backend has a higher record
        if (backendLevel && backendLevel > (localLevel || 0)) {
            if (typeof localStorage !== 'undefined') {
                try {
                    const saved = JSON.parse(localStorage.getItem(GAME_CONFIG.storageKey) || '{}');
                    saved.unlockedLevel = resolved;
                    saved.highestLevelPlayed = resolved;
                    saved.currentLevel = resolved;
                    localStorage.setItem(GAME_CONFIG.storageKey, JSON.stringify(saved));
                    console.log(`[AnalyticsCoordinator] Synced backend level ${resolved} to local storage`);
                } catch (_) {}
            }
        }

        return resolved;
    }

    /**
     * Start a continuous play run (generates fresh runId and resets run-scoped awards)
     * Called when user presses Play or starts a fresh campaign session.
     */
    startRun() {
        this.runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        this.runLevelAwards.clear();
        this.totalRunXpEarned = 0;
        console.log(`[AnalyticsCoordinator] Started new run: ${this.runId}`);
        return this.runId;
    }

    /**
     * Reset runId (called when user exits to main menu or restarts campaign)
     */
    resetRunId() {
        this.runId = null;
        this.runLevelAwards.clear();
        this.totalRunXpEarned = 0;
        console.log('[AnalyticsCoordinator] Run reset.');
    }

    /**
     * Start tracking a level
     * @param {number} levelNumber
     */
    startLevel(levelNumber) {
        if (!this.runId) {
            this.startRun();
        }

        this.levelStartTime = Date.now();
        const levelId = String(levelNumber);

        this.bridge.startLevel(levelId, { levelNumber });
    }

    /**
     * Complete a level, compute proportional XP with performance tiers, and submit telemetry
     *
     * Educational Performance Tiers:
     * - Tier 1 (0 mistakes): 100% of level maxXp
     * - Tier 2 (1 mistake): 80% of level maxXp
     * - Tier 3 (2+ mistakes): 60% of level maxXp
     *
     * Invariants guaranteed:
     * - Retrying in the same run only awards the delta if new score is higher.
     * - Total campaign XP never exceeds 200.
     * - Updates highestLevelPlayed when advancing.
     *
     * @param {number} levelNumber
     * @param {boolean} isSuccessful
     * @param {number} mistakesCount
     * @returns {Object} { xpAwarded, levelMaxXp, totalCampaignXp, isNewHighest }
     */
    completeLevel(levelNumber, isSuccessful = true, mistakesCount = 0) {
        const timeTakenMs = Math.max(100, Date.now() - this.levelStartTime);
        const levelId = String(levelNumber);
        const maxXp = this.getLevelMaxXp(levelNumber);

        let earnedXp = 0;
        if (isSuccessful) {
            // Apply performance tier
            let tierRatio = 1.0;
            if (mistakesCount === 1) tierRatio = 0.8;
            else if (mistakesCount >= 2) tierRatio = 0.6;

            earnedXp = Math.round(maxXp * tierRatio);
            earnedXp = Math.min(maxXp, Math.max(0, earnedXp));
        }

        // Run-scoped deduplication: only award new points if higher than previous attempt in this run
        const previousAward = this.runLevelAwards.get(levelNumber) || 0;
        let deltaXp = 0;
        if (earnedXp > previousAward) {
            deltaXp = earnedXp - previousAward;
            // Guard against exceeding 200 total campaign XP
            if (this.totalRunXpEarned + deltaXp > this.TOTAL_CAMPAIGN_XP) {
                deltaXp = Math.max(0, this.TOTAL_CAMPAIGN_XP - this.totalRunXpEarned);
            }
            this.runLevelAwards.set(levelNumber, previousAward + deltaXp);
            this.totalRunXpEarned += deltaXp;
        }

        const effectiveXpForLevel = this.runLevelAwards.get(levelNumber) || earnedXp;

        // Check and advance highestLevelPlayed
        const nextLevelNumber = levelNumber + 1;
        const isNewHighest = nextLevelNumber > this.highestLevelPlayed;
        if (isNewHighest) {
            this.highestLevelPlayed = nextLevelNumber;
            // Update local storage
            try {
                const saved = JSON.parse(localStorage.getItem(GAME_CONFIG.storageKey) || '{}');
                saved.unlockedLevel = this.highestLevelPlayed;
                saved.highestLevelPlayed = this.highestLevelPlayed;
                localStorage.setItem(GAME_CONFIG.storageKey, JSON.stringify(saved));
            } catch (_) {}
        }

        // Submit via Analytics Bridge
        // 1. Submit single level-wise payload (new level contract with runId)
        const submitResult = this.bridge.endLevel(levelId, isSuccessful, timeTakenMs, effectiveXpForLevel, {
            submit: true,
            runId: this.runId,
            levelNumber
        });

        // 2. Also trigger submitReport() for hosts/apps expecting the full session report format (Crossmath compatibility)
        if (typeof this.bridge.submitReport === 'function') {
            try {
                this.bridge.submitReport();
            } catch (e) {
                console.warn('[AnalyticsCoordinator] submitReport error:', e);
            }
        }

        console.log(`[AnalyticsCoordinator] Level ${levelNumber} submitted. XP: ${effectiveXpForLevel}/${maxXp} (Delta: ${deltaXp}). Total Run XP: ${this.totalRunXpEarned}/200. Highest: ${this.highestLevelPlayed}`);

        return {
            xpAwarded: effectiveXpForLevel,
            deltaXp,
            levelMaxXp: maxXp,
            totalCampaignXp: this.totalRunXpEarned,
            highestLevelPlayed: this.highestLevelPlayed,
            submitResult
        };
    }
}

// Global Singleton Export
export const gameAnalytics = new GameAnalyticsCoordinator();
