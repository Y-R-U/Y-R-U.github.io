// Entitlements only exist in memory, scoped to the current verified account. Never in saves.
// Either entitlement opens CYBER and DEITIES: ragdojo_supporter (one-off, forever) or an
// active br8t_pass (subscription, everything on br8t). LIGHT and DARK are free.
export const API = '/api/br8t/';
const CHECKOUT_ORIGIN = 'https://checkout.stripe.com';
const PORTAL_ORIGIN = 'https://billing.stripe.com';
export const PRODUCTS = ['ragdojo_supporter', 'br8t_pass_monthly', 'br8t_pass_yearly'];

export class Purchases {
  constructor(auth, request = fetch, changed = () => {}) { this.auth = auth; this.request = (...args) => request(...args); this.changed = changed; this.reset(); this.generation = 0; this.uid = null; }
  reset() { this.owned = false; this.supporter = false; this.passActive = false; this.pass = null; }
  async token() {
    if (!this.auth.signedIn) throw new Error('Sign in using the account button first.');
    const uid = this.auth.user.uid;
    const token = await this.auth.getIdToken();
    if (!token || uid !== this.auth.user?.uid) throw new Error('Account changed. Try again.');
    return { uid, token };
  }
  /**
   * Asks the server. Only a definitive answer changes anything: signed out, or a 200 with
   * entitlements. A failed check (offline, 5xx) throws and keeps what this account was last
   * verified to own in this session, so a blip never takes a paid world away mid-fight.
   * `changed(owned, true)` fires only on a definitive answer. Test and live mode count the same.
   */
  async refresh() {
    const generation = ++this.generation;
    const uid = this.auth.user?.uid;
    if (!this.auth.signedIn || !uid) { this.uid = null; this.reset(); this.unknown = false; this.changed(false, true); return false; }
    if (uid !== this.uid) { this.uid = uid; this.reset(); }
    try {
      const token = await this.auth.getIdToken();
      if (!token) throw new Error('no token');
      if (generation !== this.generation) return this.owned;
      const res = await this.request(API + 'entitlement', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (generation !== this.generation || uid !== this.auth.user?.uid || !this.auth.signedIn) return this.owned;
      const ents = data.entitlements || {};
      this.supporter = ents.ragdojo_supporter === true;
      this.passActive = ents.br8t_pass === true;
      this.pass = data.pass && typeof data.pass === 'object' ? data.pass : null;
      this.owned = this.supporter || this.passActive;
      this.testMode = data.testMode === true;
    } catch {
      if (generation === this.generation) this.unknown = true;
      throw new Error('Could not check your purchases. Try Restore again when online.');
    }
    this.unknown = false;
    this.changed(this.owned, true); return this.owned;
  }
  async checkout(product = 'ragdojo_supporter', analytics = {}) {
    if (!PRODUCTS.includes(product)) throw new Error('Checkout unavailable.');
    const { uid, token } = await this.token();
    const res = await this.request(API + 'checkout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product, game: 'ragdojo', ...analytics }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Checkout is unavailable.');
    if (uid !== this.auth.user?.uid) throw new Error('Account changed. Try again.');
    const url = new URL(data.url);
    if (url.origin !== CHECKOUT_ORIGIN) throw new Error('Checkout unavailable.');
    return url.href;
  }
  /** Stripe's customer portal for the account's Pass: cancel, change card, invoices. */
  async portal() {
    const { uid, token } = await this.token();
    const res = await this.request(API + 'portal', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ game: 'ragdojo' }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Subscription management is unavailable.');
    if (uid !== this.auth.user?.uid) throw new Error('Account changed. Try again.');
    const url = new URL(data.url);
    if (url.origin !== PORTAL_ORIGIN) throw new Error('Subscription management is unavailable.');
    return url.href;
  }
}
