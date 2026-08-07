// The pool the default name is rolled from. Given names are not split by gender — the player
// picks that separately and the two have nothing to do with each other.

export const given = Object.freeze([
  'Wren', 'Casp', 'Idra', 'Toma', 'Sable', 'Ren', 'Vey', 'Amory', 'Kesh', 'Bryn',
  'Orla', 'Tarn', 'Juno', 'Reave', 'Nell', 'Ossian', 'Pike', 'Marek', 'Sten', 'Lark',
  'Corin', 'Ash', 'Vessa', 'Dray', 'Rook', 'Halden', 'Mira', 'Fen', 'Solla', 'Bex',
]);

export const family = Object.freeze([
  'Halloway', 'Otey', 'Marsh', 'Kell', 'Vance', 'Rooke', 'Ambrey', 'Sant', 'Dunmore',
  'Pell', 'Coburn', 'Ives', 'Thackery', 'Rask', 'Ferris', 'Lomas', 'Quill', 'Bray',
  'Sowerby', 'Nevin', 'Attwater', 'Croft', 'Delaine', 'Mott', 'Vell', 'Ashcombe',
]);

// The company name is yours to change, but it needs a default that sounds like a small freight
// outfit that has been going eighteen months.
export const companyHead = Object.freeze([
  'Ferrous', 'Longhaul', 'Kestrel', 'Tamber', 'Cold Iron', 'Bright', 'Ninth', 'Coalsack',
  'Halfmast', 'Salvage', 'Deadlight', 'Anchor', 'Redline', 'Windward',
]);

export const companyTail = Object.freeze([
  'Line', 'Carriage', 'Freight', 'Cartage', 'Haulage', 'Transit', 'Runners', 'Consignment',
]);

export default Object.freeze({ given, family, companyHead, companyTail });
