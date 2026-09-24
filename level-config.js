/**
 * Core Hindi Swar (Vowels) only — strictly no vyanjans.
 * Initial vowels: अ, आ, इ, ई, उ
 * Later vowels: ऊ, ए, ऐ, ओ, औ
 */
export const ALL_SWAR = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ'];

/**
 * Level Configurations — Hindi Balloon Swar Pop (10 Levels)
 * Exactly 10 levels from easy to hard.
 * Total campaign XP = 200 (exactly 20 XP per level).
 * Progression:
 * 1. अ, आ (Intro 2 swar, 3 balloons)
 * 2. अ, आ, इ (3 swar, 3 balloons)
 * 3. अ, आ, इ, ई (Short vs Long I discrimination, 3 balloons)
 * 4. इ, ई, उ (Introducing उ, 4 balloons)
 * 5. अ, आ, इ, ई, उ (All initial 5 swar review, 4 balloons)
 * 6. उ, ऊ (U vs OO discrimination, 4 balloons)
 * 7. ए, ऐ (E vs AI discrimination, 4 balloons)
 * 8. ओ, औ (O vs AU discrimination, 4 balloons)
 * 9. ऊ, ए, ऐ, ओ, औ (All later swar, 5 balloons)
 * 10. अ, आ, इ, ई, उ, ऊ, ए, ऐ, ओ, औ (All 10 swar master review, 5 balloons)
 */
export const LEVELS_CONFIG = [
    {
        level: 1,
        label: 'अ - आ',
        swars: ['अ', 'आ'],
        distractors: ['अ', 'आ', 'इ'],
        balloonCount: 3,
        xpWeight: 1,
        description: 'अ और आ की पहचान'
    },
    {
        level: 2,
        label: 'अ, आ, इ',
        swars: ['अ', 'आ', 'इ'],
        distractors: ['अ', 'आ', 'इ', 'ई'],
        balloonCount: 3,
        xpWeight: 1,
        description: 'अ, आ और इ की पहचान'
    },
    {
        level: 3,
        label: 'अ, आ, इ, ई',
        swars: ['अ', 'आ', 'इ', 'ई'],
        distractors: ['अ', 'आ', 'इ', 'ई', 'उ'],
        balloonCount: 3,
        xpWeight: 1,
        description: 'इ और ई में अंतर और पहचान'
    },
    {
        level: 4,
        label: 'इ, ई, उ',
        swars: ['इ', 'ई', 'उ'],
        distractors: ['अ', 'इ', 'ई', 'उ', 'ऊ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'उ का परिचय'
    },
    {
        level: 5,
        label: 'अ से उ',
        swars: ['अ', 'आ', 'इ', 'ई', 'उ'],
        distractors: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'अ, आ, इ, ई, उ का अभ्यास'
    },
    {
        level: 6,
        label: 'उ - ऊ',
        swars: ['उ', 'ऊ'],
        distractors: ['उ', 'ऊ', 'अ', 'आ', 'ओ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'उ और ऊ में अंतर और पहचान'
    },
    {
        level: 7,
        label: 'ए - ऐ',
        swars: ['ए', 'ऐ'],
        distractors: ['ए', 'ऐ', 'इ', 'ई', 'अ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'ए और ऐ की पहचान'
    },
    {
        level: 8,
        label: 'ओ - औ',
        swars: ['ओ', 'औ'],
        distractors: ['ओ', 'औ', 'अ', 'आ', 'ऊ'],
        balloonCount: 4,
        xpWeight: 1,
        description: 'ओ और औ की पहचान'
    },
    {
        level: 9,
        label: 'ऊ, ए, ऐ, ओ, औ',
        swars: ['ऊ', 'ए', 'ऐ', 'ओ', 'औ'],
        distractors: ALL_SWAR,
        balloonCount: 5,
        xpWeight: 1,
        description: 'ऊ, ए, ऐ, ओ, औ का अभ्यास'
    },
    {
        level: 10,
        label: 'स्वर मास्टर (अ से औ)',
        swars: ALL_SWAR,
        distractors: ALL_SWAR,
        balloonCount: 5,
        xpWeight: 1,
        description: 'सभी 10 स्वरों की संपूर्ण पहचान'
    }
];
