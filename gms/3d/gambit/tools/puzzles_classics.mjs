// Hand-picked classic positions and famous game finishes for the GAMBIT puzzle map.
// Each is verified by tools/puzzles_build.mjs (core rules; mate solver for mate-in-N <= 3;
// engine "best move clearly better" check for the non-mate lines).
//
//   pgn    SAN moves from the start position that lead to the puzzle (or `fen`)
//   setup  SAN of the opponent move that the board plays first (omit = player starts)
//   line   SAN, player first, then opponent / player alternating, ends on a player move
//   region map region id it is placed in (by rating)
export const CLASSICS = [
  {
    id: 'c-fool', name: "Fool's Mate", region: 'first-steps', r: 400, th: 'mateIn1 mate opening',
    pgn: 'f3 e5', setup: 'g4', line: ['Qh4#'],
    story: 'The fastest checkmate there is. White has opened the door to their own king twice — walk in.',
  },
  {
    id: 'c-scholar', name: "Scholar's Mate", region: 'first-steps', r: 450, th: 'mateIn1 mate opening',
    pgn: 'e4 e5 Bc4 Nc6 Qh5', setup: 'Nf6', line: ['Qxf7#'],
    story: 'Queen and bishop both stare at f7, the weakest square in Black\'s camp. Black just attacked the queen instead of defending it.',
  },
  {
    id: 'c-arabian', name: 'The Arabian Mate', region: 'first-steps', r: 600, th: 'mateIn1 mate arabianMate',
    fen: '7k/1R6/5N2/8/8/8/6PP/6K1 w - - 0 1', line: ['Rh7#'],
    story: 'Rook and knight working as a pair — a pattern already written down in Arabic chess manuscripts over a thousand years ago.',
  },
  {
    id: 'c-legal', name: "Légal's Mate", region: 'mating-nets', r: 950, th: 'mateIn2 mate opening sacrifice',
    pgn: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5', setup: 'Bxd1', line: ['Bxf7+', 'Ke7', 'Nd5#'],
    story: 'Paris, Café de la Régence, 1750. Légal "blundered" his queen on purpose — and Black, greedy, took it.',
  },
  {
    id: 'c-boden', name: "Boden's Mate", region: 'mating-nets', r: 1100, th: 'mateIn2 mate bodenMate sacrifice',
    fen: '2kr3r/pp1n1ppp/2n5/8/5B2/3B1Q2/PPP2PPP/6K1 w - - 0 1', line: ['Qxc6+', 'bxc6', 'Ba6#'],
    story: 'Named after Samuel Boden (1853): two bishops on crossing diagonals trap a king that castled long behind its own pieces.',
  },
  {
    id: 'c-philidor', name: "Philidor's Legacy", region: 'sacrifice-cliffs', r: 1450, th: 'mateIn4 mate smotheredMate sacrifice',
    fen: 'r3r2k/1p4pp/8/6N1/2Q5/8/1q1r2PP/5R1K w - - 0 1', line: ['Nf7+', 'Kg8', 'Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#'],
    story: 'Black threatens mate on g2, so every move must be a check. The knight dances, the queen is given away, and the king is buried by its own rook — the smothered mate Philidor wrote up in 1749.',
  },
  {
    id: 'c-anastasia', name: "Anastasia's Mate", region: 'mating-nets', r: 1350, th: 'mateIn3 mate anastasiaMate sacrifice',
    fen: '5rk1/ppp2ppp/8/3NR2Q/8/8/PPP2PPP/6K1 w - - 0 1', line: ['Ne7+', 'Kh8', 'Qxh7+', 'Kxh7', 'Rh5#'],
    story: 'From the 1803 novel "Anastasia und das Schachspiel": a knight walls in the king and a rook closes the h-file.',
  },
  {
    id: 'c-blackburne', name: 'The Blackburne Shilling Trap', region: 'hidden-blades', r: 1250, th: 'opening trap attack',
    goal: 'Punish the greedy knight',
    pgn: 'e4 e5 Nf3 Nc6 Bc4 Nd4', setup: 'Nxe5', line: ['Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#'],
    story: 'Joseph Blackburne is said to have won a shilling a game with this in London coffee houses. White just took the e5 pawn.',
  },
  {
    id: 'c-opera', name: 'The Opera Game', region: 'sacrifice-cliffs', r: 1400, th: 'attack sacrifice', goal: 'Finish like Morphy · 3 moves',
    pgn: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1',
    setup: 'Qe6', line: ['Bxd7+', 'Nxd7', 'Qb8+', 'Nxb8', 'Rd8#'],
    story: 'Paris Opera, 1858. Paul Morphy played the Duke of Brunswick and Count Isouard in a box during The Barber of Seville. Finish it as he did.',
  },
  {
    id: 'c-reti-tartakower', name: 'Réti – Tartakower, 1910', region: 'sacrifice-cliffs', r: 1500, th: 'mateIn3 mate sacrifice',
    pgn: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O', setup: 'Nxe4',
    line: ['Qd8+', 'Kxd8', 'Bg5+', 'Kc7', 'Bd8#'],
    story: 'Vienna, 1910. Tartakower grabbed a knight; Réti answered with one of the most famous queen sacrifices ever played.',
  },
  {
    id: 'c-immortal', name: 'The Immortal Game', region: 'sacrifice-cliffs', r: 1650, th: 'mateIn3 mate sacrifice',
    pgn: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2',
    setup: 'Na6', line: ['Nxg7+', 'Kd8', 'Qf6+', 'Nxf6', 'Be7#'],
    story: 'London, 1851. Anderssen has given away both rooks and a bishop. Three minor pieces and a queen are left — it is enough.',
  },
  {
    id: 'c-evergreen', name: 'The Evergreen Game', region: 'storm-keep', r: 1900, th: 'mateIn5 mate sacrifice long',
    pgn: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1',
    setup: 'Qxf3', line: ['Rxe7+', 'Nxe7', 'Qxd7+', 'Kxd7', 'Bf5+', 'Ke8', 'Bd7+', 'Kf8', 'Bxe7#'],
    story: 'Berlin, 1852. Dufresne has just taken White\'s knight and threatens mate on g2. Anderssen strikes first — every move a check.',
  },
  {
    id: 'c-lasker-thomas', name: 'Ed. Lasker – Thomas, 1912', region: 'storm-keep', r: 1850, th: 'attack sacrifice long kingHunt',
    goal: 'Start the king hunt · 3 moves',
    pgn: 'd4 e6 Nf3 f5 Nc3 Nf6 Bg5 Be7 Bxf6 Bxf6 e4 fxe4 Nxe4 b6 Ne5 O-O Bd3 Bb7 Qh5', setup: 'Qe7',
    line: ['Qxh7+', 'Kxh7', 'Nxf6+', 'Kh6', 'Neg4+'],
    story: 'London, 1912: the most famous king hunt of all. Give the queen and drive the king out — in the game it was dragged all the way to g1 and mated there six moves later.',
  },
  {
    id: 'c-reti-study', name: 'Réti\'s Study, 1921', region: 'endgame-vale', r: 1800, th: 'endgame pawnEndgame equality study',
    goal: 'White to play and draw',
    fen: '7K/8/k1P5/7p/8/8/8/8 w - - 0 1', line: ['Kg7', 'h4', 'Kf6'],
    story: 'Richard Réti\'s miracle: the white king looks hopelessly far from both pawns — but a diagonal walk chases two hares at once.',
  },
  {
    id: 'c-saavedra', name: 'The Saavedra Position, 1895', region: 'gm-peaks', r: 2300, th: 'endgame underPromotion study long',
    goal: 'White to play and win',
    fen: '8/8/1KP5/3r4/8/8/8/k7 w - - 0 1', pgn: 'c7 Rd6+ Kb5 Rd5+ Kb4 Rd4+ Kb3', setup: 'Rd3+', line: ['Kc2', 'Rd4', 'c8=R', 'Ra4', 'Kb3'],
    story: 'Found by a Spanish priest, Fernando Saavedra. The king has climbed away from the checks; now the pawn queens… but a queen walks into a stalemate trick. Promote to something humbler.',
  },
  {
    id: 'c-englund', name: 'The Englund Gambit Trap', region: 'forks-pins', r: 1000, th: 'opening trap attack',
    goal: 'Spring the trap · 5 moves',
    pgn: 'd4 e5 dxe5 Nc6 Nf3 Qe7', setup: 'Bf4', line: ['Qb4+', 'Bd2', 'Qxb2', 'Bc3', 'Bb4', 'Qd2', 'Bxc3', 'Qxc3', 'Qc1#'],
    story: 'A cheeky gambit that has caught thousands online. White\'s bishop has wandered off and left b2 unguarded.',
  },
  {
    id: 'c-elephant', name: 'The Elephant Trap', region: 'forks-pins', r: 1150, th: 'opening trap pin',
    goal: 'Punish the pawn grab · 2 moves',
    pgn: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5', setup: 'Nxd5', line: ['Nxd5', 'Bxd8', 'Bb4+'],
    story: 'A trap in the Queen\'s Gambit Declined, known since the 1890s. The "pinned" knight on d7 is not really pinned — and after the check White must give the queen back.',
  },
  {
    id: 'c-lasker-trap', name: 'The Lasker Trap', region: 'hidden-blades', r: 1400, th: 'opening trap underPromotion',
    goal: 'Find the knight promotion',
    pgn: 'd4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3', setup: 'Bxb4', line: ['exf2+', 'Ke2', 'fxg1=N+'],
    story: 'Albin Countergambit. Grabbing the bishop on b4 walks into a pawn that will not stop — and the right promotion is not a queen.',
  },
];
