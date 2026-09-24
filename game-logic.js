import { ALL_SWAR } from './level-config.js';

/**
 * Phonetically or visually similar pairs among Hindi Swar:
 * अ ↔ आ, ओ, औ
 * इ ↔ ई, ए
 * उ ↔ ऊ, ओ
 * ए ↔ ऐ, इ
 * ओ ↔ औ, आ
 */
export const SWAR_LOOKALIKES = {
    'अ': ['आ', 'ओ', 'औ', 'उ'],
    'आ': ['अ', 'ओ', 'औ'],
    'इ': ['ई', 'ए', 'ऐ'],
    'ई': ['इ', 'ए', 'ऐ'],
    'उ': ['ऊ', 'ओ', 'अ'],
    'ऊ': ['उ', 'ओ', 'औ'],
    'ए': ['ऐ', 'इ', 'ई'],
    'ऐ': ['ए', 'इ', 'ई'],
    'ओ': ['औ', 'आ', 'अ', 'ऊ'],
    'औ': ['ओ', 'आ', 'अ']
};

/**
 * Generate smart distractors for Hindi Swar recognition (strictly vowels, no vyanjans)
 */
function generateSmartDistractors(target, count, pool, distractorPool, mistakeHistory = {}) {
    const set = new Set([target]);

    // 1. Prioritize swar previously missed (Adaptive learning)
    Object.keys(mistakeHistory).forEach(swar => {
        if (swar !== target && distractorPool.includes(swar) && set.size < count) {
            set.add(swar);
        }
    });

    // 2. Visually / phonetically similar swar lookalikes
    const lookalikes = SWAR_LOOKALIKES[target] || [];
    for (const swar of lookalikes) {
        if (set.size >= count) break;
        if (distractorPool.includes(swar)) {
            set.add(swar);
        }
    }

    // 3. Fill from current level swars pool
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    for (const swar of shuffledPool) {
        if (set.size >= count) break;
        set.add(swar);
    }

    // 4. Fill from level distractorPool if still needed
    if (set.size < count) {
        const shuffledDistractors = [...distractorPool].sort(() => Math.random() - 0.5);
        for (const swar of shuffledDistractors) {
            if (set.size >= count) break;
            set.add(swar);
        }
    }

    // 5. Fallback to all swar (strictly vowels)
    if (set.size < count) {
        const shuffledAll = [...ALL_SWAR].sort(() => Math.random() - 0.5);
        for (const swar of shuffledAll) {
            if (set.size >= count) break;
            set.add(swar);
        }
    }

    return Array.from(set).sort(() => Math.random() - 0.5);
}

export class GameLogic {
    /**
     * Generate a new challenge question for the given level
     * @param {Object} levelDef - Level configuration entry from level-config.js
     * @param {Object} options - { currentLevel, mistakeHistory, previousTarget }
     * @returns {Object} Question definition:
     *   - target: identifier/value of the correct answer (e.g. 'अ')
     *   - promptDisplay: string to display on the challenge card
     *   - promptSubtext: text above prompt ("स्वर पहचानो")
     *   - speechText: text for Hindi TTS speech (e.g. "पहचानो 'अ'")
     *   - options: array of balloon options [{ value, display, isCorrect }]
     */
    static generateQuestion(levelDef, options = {}) {
        const mistakeHistory = options.mistakeHistory || {};
        const previousTarget = options.previousTarget || null;
        const pool = levelDef.swars || ALL_SWAR;

        // Pick random target swar within level pool (avoid immediate repeat if pool > 1)
        let targetSwar = pool[Math.floor(Math.random() * pool.length)];
        if (pool.length > 1 && targetSwar === previousTarget) {
            const altPool = pool.filter(s => s !== previousTarget);
            targetSwar = altPool[Math.floor(Math.random() * altPool.length)];
        }

        const balloonCount = Math.min(Math.max(levelDef.balloonCount || 3, 3), 6);
        const distractorPool = levelDef.distractors || (pool.length >= balloonCount ? pool : ALL_SWAR);

        const swars = generateSmartDistractors(targetSwar, balloonCount, pool, distractorPool, mistakeHistory);

        const balloonOptions = swars.map(char => ({
            value: char,
            display: char,
            isCorrect: char === targetSwar,
        }));

        return {
            target: targetSwar,
            promptDisplay: targetSwar,
            promptSubtext: 'स्वर पहचानो',
            speechText: `पहचानो '${targetSwar}'`,
            options: balloonOptions,
        };
    }

    /**
     * Check if a tapped balloon is correct
     * @param {*} tappedValue
     * @param {*} targetValue
     * @returns {boolean}
     */
    static checkAnswer(tappedValue, targetValue) {
        return tappedValue === targetValue;
    }

    /**
     * Record mistake for adaptive distractor generation
     */
    static recordMistake(mistakeHistory, tappedValue) {
        mistakeHistory[tappedValue] = (mistakeHistory[tappedValue] || 0) + 1;
    }
}
