// Pure coordinator: reads must succeed before writes, and every operation carries a UID.
export function played(s) {
  return !!s && [s, ...Object.values(s.stash || {})].some(r =>
    r.level > 0 || r.wins > 0 || r.losses > 0 || r.completed || r.records?.wins > 0);
}
export class SaveSync {
  constructor(io) { this.io = io; this.generation = 0; this.uid = null; this.ready = false; this.pending = null; this.conflict = null; }
  async connect(uid) {
    const generation = ++this.generation;
    this.uid = uid; this.ready = false; this.conflict = null;
    if (!uid) { this.io.status('Play saved on this device. Sign in for cloud saves.'); return; }
    this.io.status('Checking cloud save…');
    try {
      const remote = await this.io.read(uid);
      if (this.io.safe) await this.io.safe();
      if (generation !== this.generation) return;
      this.remoteRevision = remote?.revision || null;
      const current = this.io.local();
      const lp = played(current.save), rp = played(remote?.save);
      const different = remote && remote.revision !== current.revision;
      if (lp && current.owner && current.owner !== uid) {
        this.conflict = { local: current, remote: remote || this.io.empty() };
        this.io.status('This device has another account’s progress. Choose a save.');
        this.io.conflict(this.conflict); return;
      }
      if (lp && rp && different) {
        this.conflict = { local: current, remote };
        this.io.status('Two played saves: choose which progress to keep.');
        this.io.conflict(this.conflict);
        return;
      }
      if (remote && different && (rp || !lp)) {
        // Never reload or replace a live fight; the game applies at the next safe menu.
        this.io.adopt(remote); this.pending = null;
      } else if (!remote || (lp && !rp && different)) {
        await this.io.write(uid, current, remote?.revision || null);
        this.remoteRevision = current.revision;
        if (generation !== this.generation) return;
        if (this.io.local().revision === current.revision) this.pending = null;
      }
      this.ready = true; this.io.status('Cloud save ready.');
      if (this.pending) await this.flush();
    } catch { if (generation === this.generation) this.io.status('Cloud unavailable. Progress stays on this device; retry when online.'); }
  }
  changed() { this.pending = this.io.local(); }
  async choose(which) {
    const c = this.conflict, uid = this.uid, generation = this.generation;
    if (!c || !uid) return;
    const selected = which === 'remote' ? c.remote : this.io.local();
    try {
      if (which !== 'remote') await this.io.write(uid, selected, this.remoteRevision);
      if (generation !== this.generation) return;
      if (which === 'remote') this.io.adopt(selected);
      this.remoteRevision = selected.revision;
      this.conflict = null; this.pending = null; this.ready = true;
      this.io.status('Cloud save ready.'); this.io.conflict(null);
    } catch { this.io.status('Could not sync. Both saves are still available.'); }
  }
  async flush() {
    if (!this.uid || !this.ready || !this.pending || this.conflict || this.writing) return;
    const uid = this.uid, generation = this.generation, data = this.pending;
    this.writing = true;
    try {
      // Check remote revision again before replacing another device's progress.
      const remote = await this.io.read(uid);
      if (generation !== this.generation) return;
      if ((remote?.revision || null) !== this.remoteRevision) {
        this.conflict = { local: this.io.local(), remote }; this.ready = false;
        this.io.status('Another device has progress. Choose a save.'); this.io.conflict(this.conflict); return;
      }
      await this.io.write(uid, data, remote?.revision || null);
      if (generation !== this.generation) return;
      this.remoteRevision = data.revision;
      if (this.pending?.revision === data.revision) this.pending = null;
      this.io.status('Cloud save ready.');
    } catch { if (generation === this.generation) this.io.status('Cloud unavailable. Your local progress is safe.'); }
    finally { this.writing = false; }
  }
}
