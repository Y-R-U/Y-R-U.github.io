/**
 * utils.js - Number formatting, helpers
 */

const Utils = (() => {
  const SUFFIXES = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc',
    'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc',
    'SpDc', 'OcDc', 'NoDc', 'Vg'
  ];

  function formatNumber(n) {
    if (n < 1000) return Math.floor(n).toString();
    const tier = Math.floor(Math.log10(Math.abs(n)) / 3);
    if (tier === 0) return Math.floor(n).toString();
    const suffix = SUFFIXES[tier] || `e${tier * 3}`;
    const scale = Math.pow(10, tier * 3);
    const scaled = n / scale;
    return scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + suffix;
  }

  function formatCoins(n) {
    if (n < 0.01) return '$0';
    if (n < 1) return '$' + n.toFixed(2);
    if (n < 10) return '$' + n.toFixed(1);
    if (n < 1000) return '$' + Math.floor(n).toString();
    return '$' + formatNumber(n);
  }

  function formatTime(seconds) {
    if (seconds < 60) return Math.floor(seconds) + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  return { formatNumber, formatCoins, formatTime, randInt, randFloat, lerp, clamp };
})();
