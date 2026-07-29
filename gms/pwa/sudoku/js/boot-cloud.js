// Optional br8t account layer. The game's own scripts are classic (no modules),
// so the import lives here on its own rather than in game.js.
//
// It is deliberately fire-and-forget: if the account layer can't load — offline,
// blocked, opened from file:// — the game plays on with a purely local save and
// the only thing missing is the avatar. `?test` keeps automated runs hermetic.
(function () {
  if (new URLSearchParams(location.search).has('test')) return;
  import('./cloud.js')
    .then(m => { window.SudokuCloud = m; })
    .catch(() => { /* play on locally */ });
})();
