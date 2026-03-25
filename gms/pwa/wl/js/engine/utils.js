// utils.js - Utility functions
'use strict';

const Utils = {
    rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },

    dist(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    },

    clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    },

    inBounds(col, row) {
        return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS;
    },

    neighbors(col, row) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        return dirs
            .map(([dc, dr]) => [col + dc, row + dr])
            .filter(([c, r]) => Utils.inBounds(c, r));
    },

    cardinalNeighbors(col, row) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        return dirs
            .map(([dc, dr]) => [col + dc, row + dr])
            .filter(([c, r]) => Utils.inBounds(c, r));
    },

    uid: (() => {
        let id = 0;
        return () => ++id;
    })(),

    deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
};
