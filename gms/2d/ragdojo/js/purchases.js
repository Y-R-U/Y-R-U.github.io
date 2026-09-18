// Entitlements only exist in memory, scoped to the current verified account. Never in saves.
export class Purchases {
  constructor(auth, request = fetch, changed = () => {}) { this.auth = auth; this.request = (...args) => request(...args); this.changed = changed; this.owned = false; this.generation = 0; this.uid = null; }
  async refresh() {
    const generation = ++this.generation;
    this.owned = false; this.changed(false);
    const uid = this.auth.user?.uid;
    this.uid = uid;
    if (!this.auth.signedIn) return false;
    const token = await this.auth.getIdToken();
    if (!token || generation !== this.generation) return false;
    const res = await this.request('/api/ragdojo/entitlement', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) throw new Error('Could not check your purchase. Try Restore again when online.');
    const data = await res.json();
    if (generation !== this.generation || uid !== this.auth.user?.uid || !this.auth.signedIn) return false;
    this.owned = data.owned === true && data.product === 'ragdojo_dark' && data.testMode === true;
    this.changed(this.owned); return this.owned;
  }
  async checkout(analytics = {}) {
    if (!this.auth.signedIn) throw new Error('Sign in using the account button first.');
    const uid = this.auth.user.uid;
    const token = await this.auth.getIdToken();
    if (!token || uid !== this.auth.user?.uid) throw new Error('Account changed. Try again.');
    const res = await this.request('/api/ragdojo/checkout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(analytics) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Checkout is unavailable.');
    if (uid !== this.auth.user?.uid) throw new Error('Account changed. Try again.');
    const url = new URL(data.url);
    if (!data.testMode || url.origin !== 'https://checkout.stripe.com') throw new Error('Checkout unavailable.');
    return url.href;
  }
}
