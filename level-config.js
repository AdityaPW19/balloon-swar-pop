/**
 * Core Hindi Swar (Vowels) only — strictly no vyanjans.
 * Initial vowels: अ, आ, इ, ई, उ
 * Later vowels: ऊ, ए, ऐ, ओ, औ
 */
export const ALL_SWAR = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ'];

/**
 * Level Configurations — Hindi Balloon Swar Pop (4 Levels)
 * Streamlined 4 progressive levels to avoid repetition while maintaining rich variety:
 * Total campaign XP = 200 (exactly 50 XP max per level).
 *
 * Progression:
 * 1. अ, आ, इ, ई (First 4 basic vowels, 3 balloons)
 * 2. उ, ऊ, ए, ऐ (Middle vowels with sound discrimination, 4 balloons)
 * 3. ओ, औ, अ, आ (Later vowels + contrasting initial vowels, 4 balloons)
 * 4. अ, आ, इ, ई, उ, ऊ, ए, ऐ, ओ, औ (All 10 swar master review, 5 balloons)
 */
export const LEVELS_CONFIG = [
    {
        level: 1,
        label: 'अ, आ, इ, ई',
        swars: ['अ', 'आ', 'इ', 'ई'],
        distractors: ['अ', 'आ', 'इ', 'ई', 'उ'],
        balloonCount: 3,
        xpWeight: 1,
        description: 'अ, आ, इ, ई की पहचान'
    },
    {
        level: 2,
        label: 'उ, ऊ, ए, ऐ',
        swars: ['उ', 'ऊ', 'ए', 'ऐ'],
        distractors: ['उ', 'ऊ', 'ए', 'ऐ', 'इ', 'ई'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'उ, ऊ, ए, ऐ की पहचान'
    },
    {
        level: 3,
        label: 'ओ, औ, अ, आ',
        swars: ['ओ', 'औ', 'अ', 'आ'],
        distractors: ['ओ', 'औ', 'अ', 'आ', 'ऊ', 'ऐ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'ओ और औ की विशेष पहचान'
    },
    {
        level: 4,
        label: 'स्वर मास्टर (अ से औ)',
        swars: ALL_SWAR,
        distractors: ALL_SWAR,
        balloonCount: 5,
        xpWeight: 1,
        description: 'सभी 10 स्वरों की संपूर्ण पहचान'
    }
];
