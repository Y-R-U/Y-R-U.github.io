// constants.js - Game constants and configuration
'use strict';

const TILE_SIZE = 48;
const MAP_COLS = 40;
const MAP_ROWS = 30;
const MAX_STACK_SIZE = 8;
const MAX_PLAYERS = 8;
const FOG_REVEAL_RADIUS = 3;
const HERO_SEARCH_CHANCE = 0.4;

const TERRAIN = {
    GRASS:    { id: 0, name: 'Grass',    color: '#4a8c3f', moveCost: 1, defense: 0 },
    FOREST:   { id: 1, name: 'Forest',   color: '#2d5a27', moveCost: 2, defense: 1 },
    HILLS:    { id: 2, name: 'Hills',    color: '#8a7a4a', moveCost: 2, defense: 2 },
    MOUNTAIN: { id: 3, name: 'Mountain', color: '#6b6b6b', moveCost: 99, defense: 3 },
    WATER:    { id: 4, name: 'Water',    color: '#2a6496', moveCost: 99, defense: 0 },
    SWAMP:    { id: 5, name: 'Swamp',    color: '#5a7a4a', moveCost: 3, defense: -1 },
    ROAD:     { id: 6, name: 'Road',     color: '#c4a86a', moveCost: 0.5, defense: 0 },
    BRIDGE:   { id: 7, name: 'Bridge',   color: '#9a7a4a', moveCost: 1, defense: 0 },
    CITY:     { id: 8, name: 'City',     color: '#888888', moveCost: 1, defense: 3 },
    RUIN:     { id: 9, name: 'Ruin',     color: '#7a6a5a', moveCost: 1, defense: 1 },
};

const TERRAIN_BY_ID = {};
Object.values(TERRAIN).forEach(t => TERRAIN_BY_ID[t.id] = t);

const UNIT_TYPES = {
    LIGHT_INF:  { id: 0,  name: 'Light Infantry',  str: 2, moves: 3, cost: 2,  turns: 1, symbol: 'LI', flying: false },
    HEAVY_INF:  { id: 1,  name: 'Heavy Infantry',   str: 4, moves: 2, cost: 4,  turns: 2, symbol: 'HI', flying: false },
    CAVALRY:    { id: 2,  name: 'Cavalry',           str: 3, moves: 4, cost: 4,  turns: 2, symbol: 'Cv', flying: false },
    ELVES:      { id: 3,  name: 'Elves',             str: 3, moves: 3, cost: 4,  turns: 2, symbol: 'El', flying: false },
    DWARVES:    { id: 4,  name: 'Dwarves',           str: 5, moves: 2, cost: 5,  turns: 2, symbol: 'Dw', flying: false },
    WOLVES:     { id: 5,  name: 'Wolves',            str: 2, moves: 5, cost: 3,  turns: 1, symbol: 'Wf', flying: false },
    GIANTS:     { id: 6,  name: 'Giants',            str: 7, moves: 2, cost: 8,  turns: 3, symbol: 'Gi', flying: false },
    GRIFFINS:   { id: 7,  name: 'Griffins',          str: 4, moves: 5, cost: 6,  turns: 3, symbol: 'Gr', flying: true },
    UNDEAD:     { id: 8,  name: 'Undead',             str: 3, moves: 3, cost: 3,  turns: 1, symbol: 'Un', flying: false },
    DRAGONS:    { id: 9,  name: 'Dragons',            str: 9, moves: 4, cost: 12, turns: 4, symbol: 'Dr', flying: true },
    HERO:       { id: 10, name: 'Hero',               str: 5, moves: 3, cost: 0,  turns: 0, symbol: 'Hr', flying: false },
};

const UNIT_TYPE_BY_ID = {};
Object.values(UNIT_TYPES).forEach(u => UNIT_TYPE_BY_ID[u.id] = u);

const PLAYER_COLORS = [
    { name: 'Sirians',      primary: '#3366cc', secondary: '#5588ee', banner: '#2244aa' },
    { name: 'Storm Giants',  primary: '#cc3333', secondary: '#ee5555', banner: '#aa2222' },
    { name: 'Grey Dwarves', primary: '#888888', secondary: '#aaaaaa', banner: '#666666' },
    { name: 'Orcs of Kor',  primary: '#33aa33', secondary: '#55cc55', banner: '#228822' },
    { name: 'Elvallie',     primary: '#cccc33', secondary: '#eeee55', banner: '#aaaa22' },
    { name: 'Selentines',   primary: '#cc6633', secondary: '#ee8855', banner: '#aa4422' },
    { name: 'Horse Lords',  primary: '#9933cc', secondary: '#bb55ee', banner: '#7722aa' },
    { name: 'Lord Bane',    primary: '#333333', secondary: '#555555', banner: '#111111' },
];

const ITEMS = [
    { name: 'Sword of Might',    strBonus: 2 },
    { name: 'Shield of Valor',   strBonus: 1 },
    { name: 'Crown of Command',  strBonus: 3 },
    { name: 'Staff of Power',    strBonus: 2 },
    { name: 'Ring of Protection', strBonus: 1 },
    { name: 'Amulet of Fury',    strBonus: 2 },
    { name: 'Helm of Wisdom',    strBonus: 1 },
    { name: 'Boots of Speed',    strBonus: 0, movesBonus: 2 },
];

const RUIN_REWARDS = ['item', 'gold', 'ally', 'nothing', 'nothing'];

const CITY_NAMES = [
    'Dorvale', 'Stormheim', 'Greyrock', 'Korhold', 'Elvenhall',
    'Selentia', 'Horsegate', 'Darkspire', 'Ironforge', 'Greendale',
    'Northwatch', 'Southport', 'Westmarch', 'Eastfield', 'Highcastle',
    'Deepwood', 'Stonehaven', 'Brightwater', 'Shadowfen', 'Goldcrest',
    'Eaglepeak', 'Wolfrun', 'Thornwall', 'Misthollow', 'Sunridge',
    'Frostdale', 'Ember Keep', 'Crystal Bay', 'Raven Rock', 'Silver Falls',
    'Dragon Roost', 'Moonhaven', 'Thunder Peak', 'Iron Gate', 'Ashford',
];
