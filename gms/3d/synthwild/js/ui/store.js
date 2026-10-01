// World storage façade over js/net/api.js (local IndexedDB + cloud). Works offline.
const EXTRA = 'synthwild.worldExtra';
const readExtra = () => { try { return JSON.parse(localStorage.getItem(EXTRA) || '{}'); } catch { return {}; } };
const writeExtra = (o) => { try { localStorage.setItem(EXTRA, JSON.stringify(o)); } catch {} };

export function createStore(getApi, account) {
  const api = () => getApi();
  const withExtra = (m) => (m ? { ...m, difficulty: readExtra()[m.id]?.difficulty || m.difficulty || 'normal', cheats: !!readExtra()[m.id]?.cheats } : m);
  const setExtra = (id, o) => { const x = readExtra(); x[id] = { ...(x[id] || {}), ...o }; writeExtra(x); };

  return {
    async lists() {
      const a = api();
      if (!a) return { mine: [], pub: [] };
      const local = await a.local.list().catch(() => []);
      let cloud = [], pub = [];
      if (account.user && account.online) {
        [cloud, pub] = await Promise.all([a.worlds.listMine().catch(() => []), a.worlds.listPublic().catch(() => [])]);
      }
      const mine = [...local, ...cloud].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).map(withExtra);
      return { mine, pub: pub.map(withExtra) };
    },
    async create({ name, seed, mode, difficulty, where, cheats = false }) {
      const a = api();
      const meta = where === 'cloud' && account.user
        ? await a.worlds.create({ name, seed, mode })
        : await a.local.put({ name, seed, mode, data: null });
      setExtra(meta.id, { difficulty, cheats });
      return withExtra(meta);
    },
    async load(meta) {
      const a = api();
      const r = meta.source === 'cloud' ? await a.worlds.get(meta.id) : await a.local.get(meta.id);
      return { meta: withExtra({ ...meta, ...r.meta }), data: r.data };
    },
    // Returns the (possibly new) meta. A visitor's first save becomes their own copy.
    // onConflict(serverMeta, kind) -> 'overwrite' | 'copy' | null. kind 'missing' = the world was deleted elsewhere.
    async save(meta, data, thumb, onConflict) {
      const a = api();
      const cloud = meta.source === 'cloud';
      const copyOf = async (suffix) => {
        const o = { name: meta.name + suffix, seed: meta.seed, mode: meta.mode, data, thumb };
        const copy = cloud ? await a.worlds.create(o) : await a.local.put(o);
        setExtra(copy.id, { difficulty: meta.difficulty, cheats: !!meta.cheats });
        return withExtra(copy);
      };
      if (cloud && !meta.mine) return { meta: await copyOf(' (copy)'), copied: true };
      try {
        return { meta: withExtra(cloud ? await a.worlds.save(meta.id, data, meta.version, { thumb }) : await a.local.put({ id: meta.id, data, thumb, mustExist: true })) };
      } catch (e) {
        const missing = e?.code === 'not_found' || e?.status === 404;
        if (!missing && e?.code !== 'conflict') throw e;
        if (missing) {
          if ((onConflict ? await onConflict(null, 'missing') : null) !== 'copy') throw e;
          return { meta: await copyOf(' (saved copy)'), copied: true, conflict: true };
        }
        const choice = onConflict ? await onConflict(e.current, 'conflict') : 'copy';
        if (choice === 'overwrite' && e.current) {
          return { meta: withExtra(await a.worlds.save(meta.id, data, e.current.version, { thumb })) };
        }
        return { meta: await copyOf(' (saved copy)'), copied: true, conflict: true };
      }
    },
    rename(meta, name) {
      const a = api();
      return meta.source === 'cloud' ? a.worlds.patch(meta.id, { name }) : a.local.put({ id: meta.id, name });
    },
    patch(meta, o) { return api().worlds.patch(meta.id, o); },
    async remove(meta) {
      const a = api();
      if (meta.source === 'cloud') await a.worlds.remove(meta.id); else await a.local.remove(meta.id);
      const x = readExtra(); delete x[meta.id]; writeExtra(x);
    },
  };
}
