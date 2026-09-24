import { createTtsBridge } from './tts-bridge/index.js';
import { GAME_CONFIG } from './game-config.js';
import { LEVELS_CONFIG } from './level-config.js';
import { GameLogic } from './game-logic.js';
import { gameAnalytics } from './analytics-manager.js';

const tts = createTtsBridge({
    source: GAME_CONFIG.tts.source,
    language: GAME_CONFIG.tts.language,
    rate: GAME_CONFIG.tts.rate,
    pitch: GAME_CONFIG.tts.pitch,
    volume: GAME_CONFIG.tts.volume
});

// Alias for level definitions
const LEVELS = LEVELS_CONFIG;
const PROGRESS_KEY = GAME_CONFIG.storageKey;
const STICKERS = GAME_CONFIG.stickers;
const PALETTE = GAME_CONFIG.balloonPalette;
const SPARKY_LABELS = GAME_CONFIG.sparkyLabels;

// GLOBAL GAME STATE
const state = {
    target: 'अ',
    currentQuestion: null,
    roundPops: 0,
    roundMistakes: 0,
    maxRoundPops: GAME_CONFIG.round.popsPerRound,
    currentLevel: 1,
    unlockedLevel: 1,
    soundEnabled: true,
    musicEnabled: true,
    isPlaying: false,
    isTutorialShown: false,
    stickersUnlocked: [0], // First sticker unlocked by default
    activeBalloons: [],
    mistakeHistory: {},
    specialEvent: null // 'golden', 'rainbow', etc.
};

let sparkyMoodTimer = null;
let sparkyMoodSequence = 0;

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function setSparkyMood(mood, resetAfter = 0) {
    const sparky = document.getElementById('sparky-guide');
    if (!sparky) return;

    sparkyMoodSequence++;
    const sequence = sparkyMoodSequence;
    clearTimeout(sparkyMoodTimer);
    sparky.className = `sparky sparky--${mood}`;
    sparky.setAttribute('aria-label', SPARKY_LABELS[mood] || SPARKY_LABELS.idle);

    if (resetAfter > 0) {
        sparkyMoodTimer = setTimeout(() => {
            if (sequence === sparkyMoodSequence) setSparkyMood('idle');
        }, resetAfter);
    }
}

// Current playing dialogue audio element instance
let currentDialogueAudio = null;
let currentTtsPurpose = null;
let pendingAnnounceTimer = null;
let speakerAnimationTimer = null;

function stopSpeakerAnimation() {
    clearTimeout(speakerAnimationTimer);
    speakerAnimationTimer = null;
    document.getElementById('announcement-speaker').classList.remove('is-announcing');
}

function animateSpeaker(text) {
    const speaker = document.getElementById('announcement-speaker');
    stopSpeakerAnimation();
    // Reset the frames so a repeated announcement starts with a fresh cartoon bounce.
    void speaker.offsetWidth;
    speaker.classList.add('is-announcing');
    const wordCount = text.trim().split(/\s+/).length;
    const duration = Math.max(1300, Math.min(3000, (wordCount / (2.4 * GAME_CONFIG.tts.rate)) * 1000 + 400));
    speakerAnimationTimer = setTimeout(stopSpeakerAnimation, duration);
}

function announceQuestion(isRepeat = false) {
    if (!state.isPlaying || !state.currentQuestion) return;

    if (pendingAnnounceTimer) {
        clearTimeout(pendingAnnounceTimer);
        pendingAnnounceTimer = null;
    }

    // If an audio clip (positive/negative/celebration dialogue) is currently playing,
    // let it finish naturally so it doesn't get cut off when moving to the next question.
    if (!isRepeat && currentDialogueAudio && !currentDialogueAudio.paused && !currentDialogueAudio.ended) {
        const remainingDuration = ((currentDialogueAudio.duration - currentDialogueAudio.currentTime) || 0.8) * 1000;
        const delay = Math.max(100, Math.min(remainingDuration + 120, 2500));
        pendingAnnounceTimer = setTimeout(() => {
            pendingAnnounceTimer = null;
            announceQuestion(false);
        }, delay);
        return;
    }

    stopSpeechFeedback();
    setSparkyMood(isRepeat ? 'curious' : 'speaking', 1100);
    if (tts.speak(state.currentQuestion.speechText)) {
        currentTtsPurpose = 'announcement';
        animateSpeaker(state.currentQuestion.speechText);
    }
}

function stopSpeechFeedback() {
    if (pendingAnnounceTimer) {
        clearTimeout(pendingAnnounceTimer);
        pendingAnnounceTimer = null;
    }
    stopSpeakerAnimation();
    tts.stop();
    currentTtsPurpose = null;
    if (currentDialogueAudio) {
        try {
            currentDialogueAudio.pause();
            currentDialogueAudio.currentTime = 0;
        } catch (e) {}
        currentDialogueAudio = null;
    }
}

function playFeedbackVoice(type) {
    if (!state.soundEnabled) return;

    // Check if prerecorded dialogue audio files are configured and not empty
    const dialogueList = GAME_CONFIG.feedback?.audioDialogues?.[type];
    if (Array.isArray(dialogueList) && dialogueList.length > 0) {
        stopSpeechFeedback();
        const selectedAudioSrc = randomItem(dialogueList);
        const audioEl = new Audio(selectedAudioSrc);
        audioEl.volume = type === 'menuDialogue'
            ? (GAME_CONFIG.audio.menuDialogueVolume ?? 0.7)
            : 1.0;
        currentDialogueAudio = audioEl;

        audioEl.addEventListener('ended', () => {
            if (currentDialogueAudio === audioEl) {
                currentDialogueAudio = null;
            }
        });

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
            playPromise.catch((err) => {
                // Audio file failed to play or does not exist, fallback to TTS
                console.warn(`[Audio] Failed to play dialogue clip "${selectedAudioSrc}", falling back to TTS:`, err);
                if (currentDialogueAudio === audioEl) {
                    currentDialogueAudio = null;
                }
                playFeedbackTts(type);
            });
        }
        return;
    }

    // Fallback: TTS
    playFeedbackTts(type);
}

function playFeedbackTts(type) {
    if (!state.soundEnabled) return;
    stopSpeechFeedback();
    let spoken = false;
    if (type === 'positive') {
        spoken = tts.speak(randomItem(GAME_CONFIG.feedback.correct));
    } else if (type === 'negative') {
        const wrongFeedback = GAME_CONFIG.feedback.wrong;
        const text = Array.isArray(wrongFeedback) ? randomItem(wrongFeedback) : wrongFeedback;
        spoken = tts.speak(text);
    } else if (type === 'levelcomplete') {
        spoken = tts.speak(randomItem(GAME_CONFIG.feedback.levelComplete));
    }
    if (spoken) currentTtsPurpose = 'feedback';
}

function createStickerImage(sticker, altText = '') {
    const image = document.createElement('img');
    image.className = 'sticker-art';
    image.src = `assets/stickers/${sticker.asset}`;
    image.alt = altText;
    image.draggable = false;
    return image;
}

function applySyncedProgress(newLevel) {
    if (!newLevel || newLevel <= 0) return;
    const maxLevel = LEVELS.length;
    const targetLevel = Math.min(newLevel, maxLevel);

    // If targetLevel is higher than current progress or currentLevel
    if (targetLevel > state.unlockedLevel || targetLevel > state.currentLevel) {
        state.unlockedLevel = Math.max(state.unlockedLevel, targetLevel);
        state.currentLevel = state.unlockedLevel;
        saveProgress();
        console.log(`[Game] Progress auto-synced: start/unlocked level updated to ${targetLevel}`);

        // Re-render level select screen if open
        const levelsScreen = document.getElementById('screen-levels');
        if (levelsScreen && !levelsScreen.classList.contains('hidden')) {
            renderLevelSelect();
        }
    }
}

function loadProgress() {
    // 1. Initialize analytics and sync highestLevelPlayed from window.userInfo / backend / URL params / localStorage
    const syncedHighestLevel = gameAnalytics.initialize();

    // 2. Read saved progress from local storage
    let localUnlocked = 1;
    let localCurrent = 1;
    try {
        const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
        if (saved) {
            localUnlocked = saved.unlockedLevel || saved.highestLevelPlayed || 1;
            localCurrent = saved.currentLevel || localUnlocked;
            state.stickersUnlocked = saved.stickersUnlocked || [0];
        }
    } catch (e) {}

    // 3. Resolve starting and unlocked level: highest between app/backend and local storage (CrossMath pattern)
    const effectiveLevel = Math.min(Math.max(syncedHighestLevel, localUnlocked, localCurrent, 1), LEVELS.length);
    state.unlockedLevel = effectiveLevel;
    state.currentLevel = effectiveLevel; // Start from the highest unlocked level

    // Save to ensure local storage matches
    saveProgress();
    console.log(`[Game] Loaded progress: start/unlocked level = ${state.currentLevel}`);

    // 4. Register auto-sync listener for real-time progress updates from backend/app
    gameAnalytics.onProgressUpdated((syncedLevel) => {
        applySyncedProgress(syncedLevel);
    });
}

function saveProgress() {
    try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({
            currentLevel: state.currentLevel,
            unlockedLevel: state.unlockedLevel,
            highestLevelPlayed: state.unlockedLevel,
            stickersUnlocked: state.stickersUnlocked
        }));
    } catch (e) {
        // Storage unavailable - progress simply won't persist
    }
}

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.isInit = false;
        this.bgMusic = null;
        this.levelCompleteAudio = null;
        this.setupAudioElements();
    }

    setupAudioElements() {
        try {
            this.bgMusic = new Audio(GAME_CONFIG.audio.bgMusic);
            this.bgMusic.loop = true;
            this.bgMusic.volume = GAME_CONFIG.audio.bgMusicVolume;
            this.bgMusic.playbackRate = GAME_CONFIG.audio.bgMusicPlaybackRate;
            this.bgMusic.preload = 'auto';

            this.levelCompleteAudio = new Audio(GAME_CONFIG.audio.levelComplete);
            this.levelCompleteAudio.volume = GAME_CONFIG.audio.levelCompleteVolume;
            this.levelCompleteAudio.preload = 'auto';
        } catch (e) {
            console.log('Audio elements could not be initialized:', e);
        }
    }

    init() {
        if (!this.isInit) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
                this.isInit = true;
            } catch (e) {
                console.log('Web Audio API not supported');
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (state.musicEnabled) {
            this.startMusic();
        }
    }

    playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.3) {
        if (!state.soundEnabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playPop() {
        if (!state.soundEnabled || !this.ctx) return;
        // Pop Sound: Frequency Sweep + White Noise Burst
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
    }

    playSuccess() {
        if (!state.soundEnabled) return;
        // Ascending Chime (C5 -> E5 -> G5)
        setTimeout(() => this.playTone(523.25, 'triangle', 0.15, 0.3), 0);
        setTimeout(() => this.playTone(659.25, 'triangle', 0.15, 0.3), 80);
        setTimeout(() => this.playTone(783.99, 'triangle', 0.25, 0.4), 160);
    }

    playLevelComplete() {
        if (!state.musicEnabled) return;
        if (this.levelCompleteAudio) {
            try {
                this.levelCompleteAudio.pause();
                this.levelCompleteAudio.currentTime = 0;
                this.levelCompleteAudio.volume = 0.5;
                const playPromise = this.levelCompleteAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {});
                }
            } catch (e) {}
        }
    }

    stopLevelComplete() {
        if (this.levelCompleteAudio) {
            try {
                this.levelCompleteAudio.pause();
                this.levelCompleteAudio.currentTime = 0;
            } catch (e) {}
        }
    }

    playWrong() {
        if (!state.soundEnabled) return;
        // Soft Boop
        this.playTone(180, 'sine', 0.2, 0.25);
    }

    playStar() {
        if (!state.soundEnabled) return;
        this.playTone(987.77, 'sine', 0.25, 0.3); // High B5 ping
    }

    startMusic() {
        if (!state.musicEnabled || !this.bgMusic) return;
        this.bgMusic.volume = 0.1;
        this.bgMusic.playbackRate = 1.0;
        const playPromise = this.bgMusic.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    }

    stopMusic() {
        if (this.bgMusic) {
            try {
                this.bgMusic.pause();
            } catch (e) {}
        }
        this.stopLevelComplete();
    }
}

const audio = new AudioEngine();

class ParticleFX {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    spawnPop(x, y, color) {
        // High quality blooming flower particles with soft sparkles
        const flowerCount = 14;
        const flowerPalettes = [
            { petals: color, center: '#fff59d' },
            { petals: '#ff80ab', center: '#fff9c4' },
            { petals: '#ffeb3b', center: '#ff7043' },
            { petals: '#b388ff', center: '#ffff8d' },
            { petals: '#69f0ae', center: '#ffffff' },
            { petals: '#40c4ff', center: '#fff176' }
        ];

        for (let i = 0; i < flowerCount; i++) {
            const angle = (i / flowerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const speed = 3.5 + Math.random() * 5.5;
            const pal = flowerPalettes[Math.floor(Math.random() * flowerPalettes.length)];
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.2,
                gravity: 0.12,
                size: 20 + Math.random() * 14, // Enlarged flower size
                color: pal.petals,
                centerColor: pal.center,
                petalCount: 5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.18,
                alpha: 1,
                decay: 0.016 + Math.random() * 0.014,
                shape: 'flower'
            });
        }

        // Add soft sparkling floating stars/dots around the pop
        for (let j = 0; j < 8; j++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.05,
                size: 6 + Math.random() * 6,
                color: '#ffffff',
                alpha: 1,
                decay: 0.03 + Math.random() * 0.02,
                shape: 'sparkle'
            });
        }
    }

    spawnConfetti() {
        const flowerPalettes = [
            { petals: '#ff4081', center: '#ffee58' },
            { petals: '#ffd54f', center: '#ff7043' },
            { petals: '#7c4dff', center: '#ffff8d' },
            { petals: '#00e676', center: '#ffffff' },
            { petals: '#00b0ff', center: '#fff59d' },
            { petals: '#ffab40', center: '#ffffff' },
            { petals: '#ff5252', center: '#ffeb3b' }
        ];

        // 1. Center fountain explosion of tumbling flowers
        for (let i = 0; i < 40; i++) {
            const pal = flowerPalettes[Math.floor(Math.random() * flowerPalettes.length)];
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const speed = 7 + Math.random() * 10;
            this.particles.push({
                x: this.canvas.width * 0.5 + (Math.random() - 0.5) * 60,
                y: this.canvas.height * 0.45,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.22,
                size: 24 + Math.random() * 14,
                color: pal.petals,
                centerColor: pal.center,
                petalCount: 5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.16,
                alpha: 1,
                decay: 0.005 + Math.random() * 0.004,
                shape: 'flower'
            });
        }

        // 2. Cascade of falling flowers across the entire screen from above
        for (let i = 0; i < 35; i++) {
            const pal = flowerPalettes[Math.floor(Math.random() * flowerPalettes.length)];
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: -30 - Math.random() * 220,
                vx: (Math.random() - 0.5) * 3.5,
                vy: 2.2 + Math.random() * 3.5,
                gravity: 0.08,
                size: 20 + Math.random() * 16,
                color: pal.petals,
                centerColor: pal.center,
                petalCount: 5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.12,
                alpha: 1,
                decay: 0.003 + Math.random() * 0.003,
                shape: 'flower'
            });
        }

        // 3. Golden sparkles floating around the burst
        for (let j = 0; j < 25; j++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height * 0.7,
                vx: (Math.random() - 0.5) * 3,
                vy: -1 - Math.random() * 4,
                gravity: 0.06,
                size: 8 + Math.random() * 8,
                color: Math.random() > 0.3 ? '#ffe082' : '#ffffff',
                alpha: 1,
                decay: 0.012 + Math.random() * 0.01,
                shape: 'sparkle'
            });
        }
    }

    spawnTitleFlowers() {
        const flowerPalettes = [
            { petals: '#ff4d6d', center: '#ffeb3b' },
            { petals: '#38bdf8', center: '#fff59d' },
            { petals: '#4ade80', center: '#ffffff' },
            { petals: '#fbbf24', center: '#ff7043' },
            { petals: '#a855f7', center: '#ffff8d' },
            { petals: '#fb923c', center: '#fff9c4' },
            { petals: '#ff80ab', center: '#ffffff' }
        ];

        const cx = this.canvas.width * 0.5;
        // Spawn around the title / sparky center area
        const cy = this.canvas.height * 0.28;
        const count = 18;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 2.8 + Math.random() * 4.6;
            const pal = flowerPalettes[Math.floor(Math.random() * flowerPalettes.length)];
            this.particles.push({
                x: cx + (Math.random() - 0.5) * 120,
                y: cy + (Math.random() - 0.5) * 60,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.2,
                gravity: 0.08,
                size: 20 + Math.random() * 14,
                color: pal.petals,
                centerColor: pal.center,
                petalCount: 5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.16,
                alpha: 1,
                decay: 0.012 + Math.random() * 0.01,
                shape: 'flower'
            });
        }

        // Add matching playful sparkles
        for (let j = 0; j < 12; j++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.8 + Math.random() * 3.5;
            this.particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.04,
                size: 7 + Math.random() * 7,
                color: Math.random() > 0.4 ? '#fde047' : '#ffffff',
                alpha: 1,
                decay: 0.02 + Math.random() * 0.015,
                shape: 'sparkle'
            });
        }
    }

    drawFlower(x, y, radius, petalColor, centerColor, rotation, petalCount = 5) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        const petalDist = radius * 0.52;
        const petalRadius = radius * 0.44;

        // Draw Petals with layered shading
        for (let i = 0; i < petalCount; i++) {
            const angle = (i * 2 * Math.PI) / petalCount;
            const px = Math.cos(angle) * petalDist;
            const py = Math.sin(angle) * petalDist;

            // Outer petal border/stroke
            ctx.beginPath();
            ctx.arc(px, py, petalRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#20243c';
            ctx.fill();

            // Petal body
            ctx.beginPath();
            ctx.arc(px, py, petalRadius - 1.5, 0, Math.PI * 2);
            ctx.fillStyle = petalColor;
            ctx.fill();

            // Inner petal highlight gleam
            ctx.beginPath();
            ctx.arc(px - petalRadius * 0.25, py - petalRadius * 0.25, petalRadius * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fill();
        }

        // Flower Center button
        const centerR = radius * 0.38;
        ctx.beginPath();
        ctx.arc(0, 0, centerR, 0, Math.PI * 2);
        ctx.fillStyle = '#20243c';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, centerR - 1.5, 0, Math.PI * 2);
        ctx.fillStyle = centerColor;
        ctx.fill();

        // Little center specular shine
        ctx.beginPath();
        ctx.arc(-centerR * 0.3, -centerR * 0.3, centerR * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        ctx.restore();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.gravity) p.vy += p.gravity;
            if (p.rotSpeed) p.rotation += p.rotSpeed;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.alpha);

            if (p.shape === 'flower') {
                this.drawFlower(p.x, p.y, p.size / 2, p.color, p.centerColor, p.rotation, p.petalCount);
            } else if (p.shape === 'sparkle') {
                // 4-point twinkling star
                this.ctx.translate(p.x, p.y);
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                const s = p.size;
                this.ctx.moveTo(0, -s);
                this.ctx.quadraticCurveTo(0, 0, s, 0);
                this.ctx.quadraticCurveTo(0, 0, 0, s);
                this.ctx.quadraticCurveTo(0, 0, -s, 0);
                this.ctx.quadraticCurveTo(0, 0, 0, -s);
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
        }
        requestAnimationFrame(() => this.animate());
    }
}

let fx = null;
let titleFx = null;
let revealNumberTimer = null;
let maskShakeTimer = null;

function spawnQuestion(announce = true) {
    if (!state.isPlaying) return;
    const area = document.getElementById('balloon-area');
    area.innerHTML = '';
    state.activeBalloons = [];

    const levelDef = LEVELS[state.currentLevel - 1] || LEVELS[LEVELS.length - 1];
    
    // Generate new question using GameLogic component
    const question = GameLogic.generateQuestion(levelDef, {
        currentLevel: state.currentLevel,
        mistakeHistory: state.mistakeHistory,
        previousTarget: state.target
    });

    state.currentQuestion = question;
    state.target = question.target;

    // Update challenge prompt card display
    const targetEl = document.getElementById('target-swar') || document.getElementById('target-letter') || document.getElementById('target-number');
    if (targetEl) {
        clearTimeout(revealNumberTimer);
        clearTimeout(maskShakeTimer);
        targetEl.classList.remove('is-revealing', 'is-wrong');
        targetEl.classList.add('is-masked');
        targetEl.textContent = '?';
        targetEl.dataset.text = '?';
        delete targetEl.dataset.resolved;
    }
    const cardSubtext = document.querySelector('#target-card > span:first-child');
    if (cardSubtext && question.promptSubtext) {
        cardSubtext.textContent = question.promptSubtext;
    }

    if (announce) {
        setTimeout(() => {
            announceQuestion();
        }, 100);
    }

    // Special Fun Event Check (Golden / Rainbow)
    state.specialEvent = null;
    if (Math.random() < 0.2) state.specialEvent = 'golden';
    else if (Math.random() < 0.1) state.specialEvent = 'rainbow';

    // Safe Grid Spawning (3 columns x 2 rows)
    const areaRect = area.getBoundingClientRect();
    const cols = 3;
    const rows = 2;
    const cellW = areaRect.width / cols;
    const cellH = areaRect.height / rows;

    const gridIndices = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);

    question.options.forEach((opt, i) => {
        const gridIdx = gridIndices[i];
        const col = gridIdx % cols;
        const row = Math.floor(gridIdx / cols);

        // Grid cell center with jitter offset
        const jitterX = (Math.random() - 0.5) * (cellW * 0.25);
        const jitterY = (Math.random() - 0.5) * (cellH * 0.2);

        const size = Math.min(cellW * 0.75, 105); // Responsive balloon size
        const x = col * cellW + (cellW - size) / 2 + jitterX;
        const y = row * cellH + (cellH - size) / 2 + jitterY;

        const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)];

        // Create Balloon DOM Element
        const wrapper = document.createElement('div');
        wrapper.className = 'balloon-wrapper';
        wrapper.style.width = `${size}px`;
        wrapper.style.height = `${size * 1.2}px`;
        wrapper.style.left = `${x}px`;
        wrapper.style.top = `${y}px`;

        const body = document.createElement('div');
        body.className = 'balloon-body';

        // Handle Special Styles
        if (opt.isCorrect && state.specialEvent === 'golden') {
            body.classList.add('balloon-golden');
        } else if (opt.isCorrect && state.specialEvent === 'rainbow') {
            body.classList.add('balloon-rainbow');
        } else {
            body.style.background = `linear-gradient(145deg, ${palette.light}, ${palette.base})`;
            if (!state.isTutorialShown && opt.isCorrect) {
                body.classList.add('balloon-tutorial-glow');
            }
        }

        const gloss = document.createElement('div');
        gloss.className = 'balloon-gloss';

        const knot = document.createElement('div');
        knot.className = 'balloon-knot';
        knot.style.color = palette.base;
        knot.innerHTML = `
            <svg viewBox="0 0 26 20" width="24" height="18" class="balloon-knot-svg">
                <path class="knot-body" d="M 13 1.5 C 15 1.5 22.5 11 22.5 14.5 C 22.5 17.5 18.5 18.5 13 18.5 C 7.5 18.5 3.5 17.5 3.5 14.5 C 3.5 11 11 1.5 13 1.5 Z" fill="currentColor" stroke="#20243c" stroke-width="3.5" stroke-linejoin="round"/>
                <path d="M 13 3.5 C 14.5 3.5 18 9 17.2 11 C 15.2 12 10.8 12 8.8 11 C 8 9 11.5 3.5 13 3.5 Z" fill="rgba(255, 255, 255, 0.75)"/>
            </svg>
        `;

        const string = document.createElement('div');
        string.className = 'balloon-string';
        string.innerHTML = `
            <svg viewBox="0 0 24 56" width="24" height="56" class="balloon-string-svg">
                <path d="M 12 0 C 12 8 9 16 9 24 C 9 32 15 36 14 44 C 13.5 48 11 52 10 56" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
            </svg>
        `;

        // Support text, symbol or image balloon content
        let balloonContent;
        if (opt.imageSrc) {
            balloonContent = document.createElement('img');
            balloonContent.className = 'balloon-image';
            balloonContent.src = opt.imageSrc;
            balloonContent.alt = opt.display || '';
        } else {
            balloonContent = document.createElement('span');
            balloonContent.className = 'balloon-number balloon-letter balloon-swar';
            balloonContent.textContent = opt.display;
        }

        body.appendChild(gloss);
        body.appendChild(balloonContent);
        body.appendChild(knot);
        wrapper.appendChild(body);
        wrapper.appendChild(string);

        // Gentle floating sinusoidal movement loop
        let floatAngle = Math.random() * Math.PI * 2;
        const floatSpeed = 0.02 + Math.random() * 0.015;
        const floatAmp = 6 + Math.random() * 8;

        function floatAnim() {
            if (!wrapper.parentElement) return;
            floatAngle += floatSpeed;
            const offsetY = Math.sin(floatAngle) * floatAmp;
            const offsetX = Math.cos(floatAngle * 0.7) * (floatAmp * 0.5);
            const rot = Math.sin(floatAngle) * 3;
            wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rot}deg)`;
            requestAnimationFrame(floatAnim);
        }
        requestAnimationFrame(floatAnim);

        // Tap Handler
        wrapper.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleBalloonTap(opt, wrapper, palette.base);
        });

        area.appendChild(wrapper);
        state.activeBalloons.push({ option: opt, wrapper });
    });
}

function handleBalloonTap(option, wrapper, color) {
    const targetEl = document.getElementById('target-swar') || document.getElementById('target-letter') || document.getElementById('target-number');
    if (targetEl.dataset.resolved === 'true') return;
    audio.init(); // Guarantee audio context unlock on interaction

    const isCorrect = GameLogic.checkAnswer(option.value, state.target);

    if (isCorrect) {
        // --- CORRECT TAP ---
        if (wrapper.dataset.resolved === 'true') return;
        wrapper.dataset.resolved = 'true';
        targetEl.dataset.resolved = 'true';
        clearTimeout(maskShakeTimer);
        targetEl.classList.remove('is-masked', 'is-wrong');
        targetEl.classList.add('is-revealing');
        const showAnswer = () => {
            targetEl.textContent = state.currentQuestion.promptDisplay;
            targetEl.dataset.text = targetEl.textContent.trim();
        };
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            showAnswer();
        } else {
            revealNumberTimer = setTimeout(showAnswer, 275);
        }
        state.isTutorialShown = true;
        if (navigator.vibrate) navigator.vibrate(25);

        // Get live visual center of the balloon body relative to fx canvas
        const bodyEl = wrapper.querySelector('.balloon-body') || wrapper;
        const bodyRect = bodyEl.getBoundingClientRect();
        const canvasRect = fx ? fx.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const popX = (bodyRect.left + bodyRect.width / 2) - canvasRect.left;
        const popY = (bodyRect.top + bodyRect.height / 2) - canvasRect.top;

        audio.playPop();
        audio.playSuccess();
        setSparkyMood(Math.random() < 0.5 ? 'correct' : 'happy', 700);
        playFeedbackVoice('positive');

        // Compress then Pop
        wrapper.classList.add('balloon-squish');

        setTimeout(() => {
            if (fx) fx.spawnPop(popX, popY, color);
            wrapper.remove(); // Remove balloon from view

            updateProgress();

            // Check if Round Complete
            if (state.roundPops >= state.maxRoundPops) {
                setTimeout(showCelebration, 400);
            } else {
                setTimeout(spawnQuestion, 600);
            }
        }, 120);

    } else {
        // --- WRONG TAP ---
        clearTimeout(maskShakeTimer);
        targetEl.classList.remove('is-wrong');
        void targetEl.offsetWidth;
        targetEl.classList.add('is-wrong');
        maskShakeTimer = setTimeout(() => targetEl.classList.remove('is-wrong'), 380);
        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);

        audio.playWrong();
        setSparkyMood('thinking');
        const reactionSequence = sparkyMoodSequence;
        setTimeout(() => {
            if (reactionSequence === sparkyMoodSequence) setSparkyMood('kind', 650);
        }, 420);
        playFeedbackVoice('negative');

        // Track mistake for adaptive system & level performance tiers
        state.roundMistakes = (state.roundMistakes || 0) + 1;
        GameLogic.recordMistake(state.mistakeHistory, option.value);

        wrapper.classList.add('balloon-wobble');
        setTimeout(() => {
            wrapper.classList.remove('balloon-wobble');
        }, 400);
    }
}

function updateProgress() {
    state.roundPops++;
    const stars = document.querySelectorAll('#progress-bar .star-icon');
    if (stars[state.roundPops - 1]) {
        const star = stars[state.roundPops - 1];
        star.textContent = '⭐';
        star.classList.remove('opacity-25', 'text-sky-900');
        star.classList.add('scale-150', 'drop-shadow-md');
        audio.playStar();
        setTimeout(() => star.classList.remove('scale-150'), 300);
    }
}

function resetProgress() {
    state.roundPops = 0;
    state.roundMistakes = 0;
    const stars = document.querySelectorAll('#progress-bar .star-icon');
    stars.forEach(star => {
        star.textContent = '☆';
        star.className = 'star-icon text-2xl opacity-25 text-sky-900 transform transition-all duration-300';
    });
}

function showCelebration() {
    fx.spawnConfetti();
    audio.playSuccess();
    audio.playLevelComplete();
    setSparkyMood('celebrate');
    playFeedbackVoice('levelcomplete');

    // Submit level completion to Analytics Coordinator & calculate dynamic XP
    const mistakes = state.roundMistakes || 0;
    const analyticsResult = gameAnalytics.completeLevel(state.currentLevel, true, mistakes);

    // Unlock the sticker tied to this level
    const stickerIdx = state.currentLevel;
    if (STICKERS[stickerIdx] && !state.stickersUnlocked.includes(stickerIdx)) {
        state.stickersUnlocked.push(stickerIdx);
    }
    
    // Synchronize progress
    state.unlockedLevel = gameAnalytics.highestLevelPlayed;
    const hasNextLevel = state.currentLevel < LEVELS.length;
    saveProgress();

    const sticker = STICKERS[stickerIdx] || STICKERS[0];
    document.getElementById('reward-icon').replaceChildren(createStickerImage(sticker, `${sticker.name} sticker`));
    document.getElementById('reward-name').textContent = sticker.name;

    const nextBtn = document.getElementById('btn-next-round');
    nextBtn.textContent = hasNextLevel ? 'NEXT LEVEL ▶' : 'PLAY AGAIN ▶';
    nextBtn.dataset.hasNext = hasNextLevel ? '1' : '0';

    const modal = document.getElementById('modal-celebration');
    modal.classList.remove('hidden');
}

function renderLevelSelect() {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    LEVELS.forEach((lvl, idx) => {
        const levelNum = idx + 1;
        const isUnlocked = levelNum <= state.unlockedLevel;
        const isCurrent = levelNum === state.currentLevel;
        const btn = document.createElement('button');
        btn.className = `level-button ${isUnlocked ? 'level-button--unlocked' : 'level-button--locked'}${isCurrent ? ' level-button--current' : ''}`;
        btn.setAttribute('aria-label', isUnlocked ? `Level ${levelNum}${isCurrent ? ', current level' : ''}` : `Level ${levelNum}, locked`);

        const content = document.createElement('span');
        content.className = 'level-button-content';
        if (isUnlocked) {
            content.textContent = String(levelNum);
        } else {
            content.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
        }
        btn.appendChild(content);
        if (isUnlocked) {
            btn.addEventListener('click', () => {
                state.currentLevel = levelNum;
                state.isPlaying = true;
                saveProgress();
                closeLevelsScreen(() => {
                    document.getElementById('screen-home').classList.add('hidden');
                    // Start run & track level in analytics
                    gameAnalytics.startRun();
                    gameAnalytics.startLevel(state.currentLevel);
                    resetProgress();
                    spawnQuestion();
                });
            });
        } else {
            btn.disabled = true;
        }
        grid.appendChild(btn);
    });
}

function renderStickerAlbum() {
    const grid = document.getElementById('album-grid');
    grid.innerHTML = '';

    STICKERS.forEach((st, idx) => {
        const isUnlocked = state.stickersUnlocked.includes(idx);
        const rarity = idx === STICKERS.length - 1
            ? { key: 'legendary', label: 'Legendary' }
            : idx >= 14
                ? { key: 'epic', label: 'Epic' }
                : idx >= 7
                    ? { key: 'rare', label: 'Rare' }
                    : { key: 'common', label: 'Common' };
        const card = document.createElement('div');
        card.className = `collectible-card ${isUnlocked ? `is-unlocked rarity-${rarity.key}` : 'is-locked'}`;

        const header = document.createElement('div');
        header.className = 'collectible-card-header';
        header.innerHTML = `
            <span>${isUnlocked ? st.name : 'Mystery'}</span>
            <span class="collectible-card-number">#${String(idx + 1).padStart(2, '0')}</span>`;

        const visual = document.createElement('div');
        visual.className = 'album-sticker-visual';
        if (isUnlocked) {
            visual.appendChild(createStickerImage(st, `${st.name} sticker`));
        } else {
            visual.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="5" y="10" width="14" height="11" rx="2"/>
                    <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                    <path d="M12 14v3"/>
                </svg>`;
        }

        const label = document.createElement('span');
        label.className = 'collectible-card-rarity';
        label.textContent = isUnlocked ? rarity.label : 'Keep Playing';
        card.append(header, visual, label);
        grid.appendChild(card);
    });
}

function startGameFromHome() {
    const home = document.getElementById('screen-home');
    const playButton = document.getElementById('btn-play');
    const gameWrapper = document.getElementById('game-wrapper');
    if (home.classList.contains('home-exiting')) return;

    state.isPlaying = true;
    audio.init();
    playButton.disabled = true;

    // Start fresh continuous run and begin level tracking
    gameAnalytics.startRun();
    gameAnalytics.startLevel(state.currentLevel);

    // Immediately prepare the level question and balloons so there is no stale number or re-render
    resetProgress();
    spawnQuestion(false);

    home.classList.add('home-exiting');

    setTimeout(() => {
        home.classList.add('hidden');
        home.classList.remove('home-exiting');
        gameWrapper.classList.add('game-entering');

        setTimeout(() => {
            gameWrapper.classList.remove('game-entering');
            playButton.disabled = false;
            announceQuestion();
        }, 540);
    }, 420);
}

// Preload SparkyArt2 for instant swap
const sparkyArt2Image = new Image();
sparkyArt2Image.src = 'assets/SparkyArt2.png';
let homeSparkySwapTimer = null;

function setupEventListeners() {
    // Home Play Button
    document.getElementById('btn-play').addEventListener('click', startGameFromHome);

    // Matching Badge & SparkyArt Press Effect & Flower Particles Spawn
    const matchingBadge = document.getElementById('badge-matching');
    const homeSparkyImg = document.getElementById('home-sparky-img');
    const homeSparkyBtn = document.getElementById('home-sparky-btn') || homeSparkyImg;

    const triggerBadgeFlowerEffect = (e) => {
        if (e) e.preventDefault();
        audio.init();
        if (navigator.vibrate) navigator.vibrate(20);

        // Trigger visual press effect
        if (matchingBadge) {
            matchingBadge.classList.add('badge-pressed');
            setTimeout(() => matchingBadge.classList.remove('badge-pressed'), 180);
        }
        if (homeSparkyBtn) {
            homeSparkyBtn.classList.add('sparky-pressed');
            setTimeout(() => homeSparkyBtn.classList.remove('sparky-pressed'), 180);
        }

        // Swap Sparky image to SparkyArt2 for 2 seconds
        if (homeSparkyImg) {
            homeSparkyImg.src = 'assets/SparkyArt2.png';
            if (homeSparkySwapTimer) {
                clearTimeout(homeSparkySwapTimer);
            }
            homeSparkySwapTimer = setTimeout(() => {
                homeSparkyImg.src = 'assets/SparkyArt.png';
                homeSparkySwapTimer = null;
            }, 2000);
        }

        // Play random menuDialogue audio if available
        const menuDialogues = GAME_CONFIG.feedback?.audioDialogues?.menuDialogue;
        if (Array.isArray(menuDialogues) && menuDialogues.length > 0) {
            playFeedbackVoice('menuDialogue');
        } else {
            audio.playStar();
        }

        // Spawn flower particles behind titleArt
        if (titleFx) {
            titleFx.spawnTitleFlowers();
        } else if (fx) {
            fx.spawnTitleFlowers();
        }
    };

    if (matchingBadge) {
        matchingBadge.addEventListener('pointerdown', triggerBadgeFlowerEffect);
        matchingBadge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                triggerBadgeFlowerEffect(e);
            }
        });
    }

    if (homeSparkyBtn) {
        homeSparkyBtn.addEventListener('pointerdown', triggerBadgeFlowerEffect);
        homeSparkyBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                triggerBadgeFlowerEffect(e);
            }
        });
    }

    // Both speaker controls replay the same target announcement.
    const replayAnnouncement = () => {
        audio.init();
        document.getElementById('target-card').classList.add('scale-110');
        setTimeout(() => document.getElementById('target-card').classList.remove('scale-110'), 200);
        announceQuestion(true);
    };
    document.getElementById('btn-speaker').addEventListener('click', replayAnnouncement);
    document.getElementById('announcement-speaker').addEventListener('click', replayAnnouncement);

    // Celebration Next Round / Next Level
    document.getElementById('btn-next-round').addEventListener('click', (e) => {
        stopSpeechFeedback();
        audio.stopLevelComplete();
        state.isPlaying = true;
        document.getElementById('modal-celebration').classList.add('hidden');
        if (e.currentTarget.dataset.hasNext === '1') {
            state.currentLevel++;
            saveProgress();
        }
        // Advance level tracking within the continuous run (preserves runId)
        gameAnalytics.startLevel(state.currentLevel);
        resetProgress();
        spawnQuestion();
    });

    // Level Select Open/Close
    document.getElementById('btn-levels').addEventListener('click', openLevelsScreen);
    document.getElementById('btn-close-levels').addEventListener('click', () => closeLevelsScreen());

    // Sticker Album Open/Close
    document.getElementById('btn-album').addEventListener('click', openAlbumScreen);
    document.getElementById('btn-close-album').addEventListener('click', () => closeAlbumScreen());

    // Settings Modal Open/Close
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-close-settings').addEventListener('click', () => closeSettingsModal());
    document.getElementById('modal-settings').addEventListener('click', (e) => {
        if (e.target.id === 'modal-settings') closeSettingsModal();
    });

    // Settings Controls
    document.getElementById('toggle-sound').addEventListener('change', (e) => {
        state.soundEnabled = e.target.checked;
        if (!state.soundEnabled) {
            // Silence Sparky's feedback only; number announcements always remain available.
            if (currentDialogueAudio) {
                currentDialogueAudio.pause();
                currentDialogueAudio.currentTime = 0;
                currentDialogueAudio = null;
            }
            if (currentTtsPurpose === 'feedback') {
                tts.stop();
                currentTtsPurpose = null;
            }
        }
    });
    document.getElementById('toggle-music').addEventListener('change', (e) => {
        state.musicEnabled = e.target.checked;
        if (state.musicEnabled) audio.startMusic();
        else audio.stopMusic();
    });

    document.getElementById('btn-home-return').addEventListener('click', () => {
        stopSpeechFeedback();
        state.isPlaying = false;
        setSparkyMood('idle');
        gameAnalytics.resetRunId();
        closeSettingsModal(() => {
            document.getElementById('screen-home').classList.remove('hidden');
        });
    });
}

function openLevelsScreen() {
    renderLevelSelect();
    const el = document.getElementById('screen-levels');
    el.classList.remove('screen-exiting', 'hidden');
    setTimeout(() => {
        const currentBtn = document.querySelector('.level-button--current');
        if (currentBtn) {
            currentBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, 60);
}

function closeLevelsScreen(onClosed) {
    const el = document.getElementById('screen-levels');
    if (el.classList.contains('hidden') || el.classList.contains('screen-exiting')) return;
    el.classList.add('screen-exiting');
    setTimeout(() => {
        el.classList.remove('screen-exiting');
        el.classList.add('hidden');
        if (typeof onClosed === 'function') onClosed();
    }, 220);
}

function openAlbumScreen() {
    renderStickerAlbum();
    const el = document.getElementById('modal-album');
    el.classList.remove('screen-exiting', 'hidden');
}

function closeAlbumScreen(onClosed) {
    const el = document.getElementById('modal-album');
    if (el.classList.contains('hidden') || el.classList.contains('screen-exiting')) return;
    el.classList.add('screen-exiting');
    setTimeout(() => {
        el.classList.remove('screen-exiting');
        el.classList.add('hidden');
        if (typeof onClosed === 'function') onClosed();
    }, 220);
}

function openSettingsModal() {
    stopSpeechFeedback();
    setSparkyMood('idle');
    const el = document.getElementById('modal-settings');
    el.classList.remove('modal-exiting', 'hidden');
}

function closeSettingsModal(onClosed) {
    const el = document.getElementById('modal-settings');
    if (el.classList.contains('hidden') || el.classList.contains('modal-exiting')) return;
    el.classList.add('modal-exiting');
    setTimeout(() => {
        el.classList.remove('modal-exiting');
        el.classList.add('hidden');
        if (typeof onClosed === 'function') onClosed();
    }, 200);
}

window.addEventListener('pagehide', () => stopSpeechFeedback());

// Global Audio & Speech Synthesis Warm-Up
function warmUpAudioAndSpeech() {
    // 1. Initialize Web Audio Context (creates or resumes on first user touch/pointer)
    audio.init();

    // 2. Preload and warm up browser SpeechSynthesis voices & engine
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.getVoices();
            // Silent dummy utterance on first gesture to wake up speech engine pipeline
            const dummy = new SpeechSynthesisUtterance('');
            dummy.volume = 0;
            dummy.lang = 'en-US';
            window.speechSynthesis.speak(dummy);
        } catch (_) {}
    }
}

// Attach early warm-up on very first user gesture anywhere on the screen
const earlyGestureOptions = { capture: true, once: true, passive: true };
['pointerdown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, warmUpAudioAndSpeech, earlyGestureOptions);
});

// Initialize Application on Window Load
window.addEventListener('load', () => {
    loadProgress();
    const canvas = document.getElementById('fx-canvas');
    fx = new ParticleFX(canvas);

    const titleCanvas = document.getElementById('title-fx-canvas');
    if (titleCanvas) {
        titleFx = new ParticleFX(titleCanvas);
    }

    setupEventListeners();

    // Pre-fetch voices if speech synthesis is available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }
});
