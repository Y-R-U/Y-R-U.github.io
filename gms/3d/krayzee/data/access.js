// br8t Pass limits (D36, docs/ACCESS.md). THE SWITCH is `enforce`:
//   'auto' (default) — limits apply only while br8t payments are LIVE: GET /api/br8t/offer answers 200, sells the
//                      br8t Pass, and reports testMode:false. Test mode, a missing API, any error, or any host other
//                      than games.br8t.com = nobody can buy a Pass, so nothing is locked ("br8t Pass coming soon").
//   'on'             — always enforce (testing, or a deliberate decision).
//   'off'            — never enforce.
// The room server has its own matching switch, KRAYZEE_ALLOWANCE (off | auto | on), in server/krayzeenet.service.
// Test overrides (ignored on games.br8t.com except ?access=): ?access=on|off|auto, ?payapi=http://127.0.0.1:N/api/br8t/
export const ACCESS = {
  enforce: 'auto',
  freeMissions: 4,                 // intro + Missions 1–4 (the C-Tower 1 chapter) are free; 5+ need the Pass
  onlinePerDay: 3,                 // shown before the server answers; the real count is the payments service's (krayzee=3)
  requireSignInOnline: true,       // a br8t sign-in (not a guest) to host or join online rooms
  api: '/api/br8t/',
  game: 'krayzee',                 // allowance key on the payments service (BR8T_FREE_PER_DAY="…,krayzee=3")
  checkoutGame: 'krayzee',         // return path on the payments service; falls back to 'hub' until it knows krayzee
  products: ['br8t_pass_monthly', 'br8t_pass_yearly'],
  liveHosts: ['games.br8t.com'],   // the only origin with the payments API and the one br8t login
};
