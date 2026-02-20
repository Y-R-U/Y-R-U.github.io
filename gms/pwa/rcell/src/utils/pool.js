// pool.js — Object pooling to avoid GC spikes
const Pool = (() => {
  function createPool(factory, reset, initialSize = 20) {
    const pool = [];
    const active = [];

    for (let i = 0; i < initialSize; i++) {
      pool.push(factory());
    }

    function acquire(...args) {
      let obj;
      if (pool.length > 0) {
        obj = pool.pop();
      } else {
        obj = factory();
      }
      reset(obj, ...args);
      active.push(obj);
      return obj;
    }

    function release(obj) {
      const idx = active.indexOf(obj);
      if (idx !== -1) {
        active.splice(idx, 1);
        pool.push(obj);
      }
    }

    function releaseAll() {
      while (active.length > 0) {
        pool.push(active.pop());
      }
    }

    function getActive() { return active; }
    function size() { return pool.length; }
    function activeCount() { return active.length; }

    return { acquire, release, releaseAll, getActive, size, activeCount };
  }

  return { createPool };
})();
