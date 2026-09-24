/**
 * Game Configuration
 * Customize this file to configure global branding, speech options, storage, audio and palettes.
 */
export const GAME_CONFIG = {
    // Unique ID for local progress storage
    storageKey: 'balloonSwarPopProgress',

    // Analytics & XP System Configuration
    analytics: {
        gameId: 'balloon-swar-pop',
        totalCampaignXp: 200, // Strict invariant: max 200 XP per campaign/run (50 XP max per level across 4 levels)
        usePerformanceTiers: true, // 100% (0 mistakes), 80% (1 mistake), 60% (2+ mistakes)
    },

    // TTS & Voice Configuration
    tts: {
        source: 'balloon-swar-pop',
        language: 'hi-IN', // 'hi-IN' for natural Hindi swar pronunciation
        rate: 0.9,
        pitch: 1,
        volume: 1.0,
    },

    // Audio assets & sound settings
    audio: {
        bgMusic: 'assets/audio/game-music.mp3',
        levelComplete: 'assets/audio/level-complete.mp3',
        bgMusicVolume: 0.1,
        bgMusicPlaybackRate: 1.0,
        levelCompleteVolume: 0.5,
        menuDialogueVolume: 0.7,
    },

    // Gameplay limits
    round: {
        popsPerRound: 5,
    },

    // Voice Feedback Lines
    feedback: {
        correct: ['शाबाश!', 'बहुत बढ़िया!', 'सही जवाब!', 'हाँ!'],
        wrong: 'फिर से सोचो.',
        levelComplete: [
            'कमाल कर दिया! लेवल पूरा हुआ!',
            'बहुत खूब!',
            'शाबाश! अगला लेवल खुल गया!'
        ],
        // Pre-recorded voice dialogue audio clips (fallback to TTS if empty or unavailable)
        audioDialogues: {
            positive: [
                'assets/sparkyDialogues/positive/aahaa-positive.mp3',
                'assets/sparkyDialogues/positive/bilkul-sahi.mp3',
                'assets/sparkyDialogues/positive/bohot-badhiya.mp3',
                'assets/sparkyDialogues/positive/bohot-khoob.mp3',
                'assets/sparkyDialogues/positive/bohot-sahi.mp3',
                'assets/sparkyDialogues/positive/maza-aa-gaya.mp3',
                'assets/sparkyDialogues/positive/sahi-jawab.mp3',
                'assets/sparkyDialogues/positive/sahi-pakde.mp3',
                'assets/sparkyDialogues/positive/supper.mp3',
            ],
            negative: [
                'assets/sparkyDialogues/negative/ahaan-negative.mp3',
                'assets/sparkyDialogues/negative/dhayan-se-dekho.mp3',
                'assets/sparkyDialogues/negative/lag-bhag-sahi.mp3',
                'assets/sparkyDialogues/negative/oh-phir-se.mp3',
                'assets/sparkyDialogues/negative/phir-koshish-karo.mp3',
                'assets/sparkyDialogues/negative/phir-se-socho.mp3',
                'assets/sparkyDialogues/negative/phir-try-kro.mp3',
            ],
            levelcomplete: [
                'assets/sparkyDialogues/levelcomplete/aapko-milte-hain-7-crore.mp3',
                'assets/sparkyDialogues/levelcomplete/jhakaas-level-complete.mp3',
                'assets/sparkyDialogues/levelcomplete/kamal-kar-diya.mp3',
                'assets/sparkyDialogues/levelcomplete/matlab-vo-alag-hi-level-ka.mp3',
                'assets/sparkyDialogues/levelcomplete/tum-to-pro-ho.mp3',
            ],
            menuDialogue: [
                'assets/sparkyDialogues/menuDialogue/bark.mp3',
                'assets/sparkyDialogues/menuDialogue/domo-domo.mp3',
                'assets/sparkyDialogues/menuDialogue/goobare-phoden.mp3',
                'assets/sparkyDialogues/menuDialogue/laal-peele-goobare.mp3',
                'assets/sparkyDialogues/menuDialogue/meow.mp3',
                'assets/sparkyDialogues/menuDialogue/yo-aapka-bhai-sparky.mp3',
                'assets/sparkyDialogues/menuDialogue/sparky-bhai-ke-aage.mp3'
            ],
        },
    },

    // Mascot sparky labels
    sparkyLabels: {
        curious: 'Sparky is curious',
        speaking: 'Sparky is speaking',
        happy: 'Sparky is happy',
        thinking: 'Sparky is thinking',
        celebrate: 'Sparky celebrates',
        idle: 'Sparky is ready',
        correct: 'Sparky gives a thumbs up',
        kind: 'Sparky is cheering you on',
    },

    // Balloon visual color palette
    balloonPalette: [
        { base: '#ff4d6d', light: '#ff758f', knot: '#c9184a' }, // Pink
        { base: '#38bdf8', light: '#7dd3fc', knot: '#0284c7' }, // Sky Blue
        { base: '#4ade80', light: '#86efac', knot: '#16a34a' }, // Mint Green
        { base: '#fbbf24', light: '#fde047', knot: '#d97706' }, // Yellow
        { base: '#a855f7', light: '#c084fc', knot: '#7e22ce' }, // Purple
        { base: '#fb923c', light: '#fdba74', knot: '#ea580c' }, // Orange
    ],

    // Sticker Album rewards unlocked on level completion (1 starter + 4 level rewards)
    stickers: [
        { id: 0, asset: 'emoji_u2b50.svg', name: 'सुपर स्टार' },
        { id: 1, asset: 'emoji_u1f308.svg', name: 'इंद्रधनुष' },
        { id: 2, asset: 'emoji_u1f680.svg', name: 'रॉकेट' },
        { id: 3, asset: 'emoji_u1f995.svg', name: 'डाइनो' },
        { id: 4, asset: 'emoji_u1f3c6.svg', name: 'स्वर चैंपियन' }
    ]
};
