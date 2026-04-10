/* config.js - Game constants, colors, and level definitions */
'use strict';

const CONFIG = {
    // Paper appearance
    PAPER_COLOR: '#f5f0e1',
    PAPER_LINE_COLOR: '#c5d8f0',
    PAPER_MARGIN_COLOR: '#e8a0a0',
    PAPER_LINE_SPACING: 28,
    PAPER_MARGIN_X: 0.12, // fraction of width

    // Ant settings
    ANT_SPEED: 1.8,
    ANT_SIZE: 14,
    ANT_TURN_SPEED: 0.06,
    ANT_WANDER_CHANGE: 0.02, // chance to change direction per frame
    ANT_WALL_DETECT: 20,

    // Drawing / Pencil
    PENCIL_COLOR: '#4a4a4a',
    PENCIL_WIDTH: 4,
    LINE_FADE_TIME: 3.5, // seconds before line starts fading
    LINE_FADE_DURATION: 1.0, // seconds to fully fade
    INK_MAX: 100,
    INK_COST_PER_PIXEL: 0.15,
    INK_REGEN_RATE: 8, // per second
    MIN_DRAW_DIST: 4, // min distance between draw points

    // Goals
    GOAL_SIZE: 18,
    GOAL_PULSE_SPEED: 2,

    // Obstacles
    OBSTACLE_COLOR: 'rgba(100, 160, 220, 0.35)',

    // Timing
    TARGET_FPS: 60,
    LEVEL_TIME_BONUS_3STAR: 0.5, // fraction of time remaining for 3 stars
    LEVEL_TIME_BONUS_2STAR: 0.25,

    // Particles
    MAX_PARTICLES: 80,
    PARTICLE_LIFE: 1.0,
};

// Goal types with their appearance
const GOAL_TYPES = {
    food: { emoji: '&#127838;', label: 'Food', color: '#c87533' },
    nest: { emoji: '&#127974;', label: 'Nest', color: '#8b6914' },
    friend: { emoji: '&#128028;', label: 'Friend', color: '#4a7340' },
    leaf: { emoji: '&#127811;', label: 'Leaf', color: '#5c8a4d' },
    sugar: { emoji: '&#127856;', label: 'Sugar', color: '#e0c080' },
};

// Level definitions
// Positions are in fractions (0-1) of playable area
const LEVELS = [
    {
        id: 1,
        name: 'First Steps',
        description: 'Guide the ant to the food!',
        timeLimit: 30,
        ants: [{ x: 0.2, y: 0.3, angle: 0 }],
        goals: [{ x: 0.8, y: 0.7, type: 'food' }],
        obstacles: [],
        antSpeed: 1.5,
    },
    {
        id: 2,
        name: 'Wrong Way',
        description: 'The ant is heading the wrong direction!',
        timeLimit: 35,
        ants: [{ x: 0.5, y: 0.5, angle: Math.PI }],
        goals: [{ x: 0.85, y: 0.5, type: 'food' }],
        obstacles: [],
        antSpeed: 1.6,
    },
    {
        id: 3,
        name: 'Fork in the Road',
        description: 'Choose the right path for the ant.',
        timeLimit: 40,
        ants: [{ x: 0.15, y: 0.5, angle: 0 }],
        goals: [{ x: 0.85, y: 0.2, type: 'leaf' }],
        obstacles: [
            { x: 0.45, y: 0.0, w: 0.04, h: 0.42 },
            { x: 0.45, y: 0.58, w: 0.04, h: 0.42 },
        ],
        antSpeed: 1.7,
    },
    {
        id: 4,
        name: 'Double Treat',
        description: 'Collect the food, then find the nest!',
        timeLimit: 50,
        ants: [{ x: 0.1, y: 0.8, angle: -Math.PI / 4 }],
        goals: [
            { x: 0.5, y: 0.2, type: 'food', order: 1 },
            { x: 0.85, y: 0.8, type: 'nest', order: 2 },
        ],
        obstacles: [],
        antSpeed: 1.7,
    },
    {
        id: 5,
        name: 'Two Friends',
        description: 'Guide both ants to their goals!',
        timeLimit: 55,
        ants: [
            { x: 0.15, y: 0.3, angle: 0 },
            { x: 0.15, y: 0.7, angle: 0 },
        ],
        goals: [
            { x: 0.85, y: 0.3, type: 'food' },
            { x: 0.85, y: 0.7, type: 'leaf' },
        ],
        obstacles: [],
        antSpeed: 1.6,
    },
    {
        id: 6,
        name: 'Speed Ant',
        description: 'This ant is in a hurry!',
        timeLimit: 35,
        ants: [{ x: 0.5, y: 0.9, angle: -Math.PI / 2 }],
        goals: [{ x: 0.5, y: 0.1, type: 'sugar' }],
        obstacles: [
            { x: 0.25, y: 0.35, w: 0.5, h: 0.04 },
            { x: 0.15, y: 0.65, w: 0.5, h: 0.04 },
        ],
        antSpeed: 2.8,
    },
    {
        id: 7,
        name: 'Water Hazard',
        description: 'Avoid the puddles!',
        timeLimit: 50,
        ants: [{ x: 0.1, y: 0.5, angle: 0 }],
        goals: [{ x: 0.9, y: 0.5, type: 'nest' }],
        obstacles: [
            { x: 0.3, y: 0.15, w: 0.12, h: 0.3 },
            { x: 0.55, y: 0.55, w: 0.12, h: 0.3 },
            { x: 0.4, y: 0.6, w: 0.08, h: 0.15 },
        ],
        antSpeed: 1.8,
    },
    {
        id: 8,
        name: 'Triple Threat',
        description: 'Three ants, three goals!',
        timeLimit: 60,
        ants: [
            { x: 0.1, y: 0.2, angle: Math.PI / 6 },
            { x: 0.1, y: 0.5, angle: 0 },
            { x: 0.1, y: 0.8, angle: -Math.PI / 6 },
        ],
        goals: [
            { x: 0.85, y: 0.15, type: 'food' },
            { x: 0.85, y: 0.5, type: 'leaf' },
            { x: 0.85, y: 0.85, type: 'sugar' },
        ],
        obstacles: [],
        antSpeed: 1.6,
    },
    {
        id: 9,
        name: 'The Maze',
        description: 'Navigate the corridors!',
        timeLimit: 60,
        ants: [{ x: 0.08, y: 0.08, angle: Math.PI / 4 }],
        goals: [{ x: 0.9, y: 0.9, type: 'nest' }],
        obstacles: [
            { x: 0.2, y: 0.0, w: 0.04, h: 0.7 },
            { x: 0.4, y: 0.3, w: 0.04, h: 0.7 },
            { x: 0.6, y: 0.0, w: 0.04, h: 0.7 },
            { x: 0.8, y: 0.3, w: 0.04, h: 0.7 },
        ],
        antSpeed: 2.0,
    },
    {
        id: 10,
        name: 'Grand Finale',
        description: 'The ultimate ant challenge!',
        timeLimit: 75,
        ants: [
            { x: 0.08, y: 0.15, angle: 0 },
            { x: 0.08, y: 0.5, angle: 0 },
            { x: 0.08, y: 0.85, angle: 0 },
        ],
        goals: [
            { x: 0.5, y: 0.15, type: 'food', order: 1 },
            { x: 0.9, y: 0.5, type: 'nest', order: 2 },
        ],
        obstacles: [
            { x: 0.3, y: 0.0, w: 0.04, h: 0.4 },
            { x: 0.3, y: 0.6, w: 0.04, h: 0.4 },
            { x: 0.65, y: 0.25, w: 0.04, h: 0.5 },
        ],
        antSpeed: 2.2,
    },
];
