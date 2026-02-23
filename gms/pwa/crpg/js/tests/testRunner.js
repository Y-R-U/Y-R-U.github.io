// ===== Lightweight Test Harness (no external deps) =====

export class TestRunner {
  constructor() {
    this.suites  = [];
    this.results = [];
  }

  describe(suiteName, fn) {
    const suite = { name: suiteName, cases: [] };
    const it = (caseName, testFn) => {
      suite.cases.push({ name: caseName, fn: testFn });
    };
    fn(it);
    this.suites.push(suite);
  }

  async runAll() {
    this.results = [];
    let totalPass = 0, totalFail = 0;

    for (const suite of this.suites) {
      const suiteResult = { name: suite.name, cases: [] };
      for (const tc of suite.cases) {
        let pass = false, error = null;
        try {
          await tc.fn();
          pass = true;
        } catch(e) {
          error = e.message || String(e);
        }
        suiteResult.cases.push({ name: tc.name, pass, error });
        if (pass) totalPass++; else totalFail++;
      }
      this.results.push(suiteResult);
    }
    return { totalPass, totalFail, results: this.results };
  }

  renderToElement(container) {
    container.innerHTML = '';
    let totalPass = 0, totalFail = 0;

    for (const suite of this.results) {
      const div = document.createElement('div');
      div.className = 'test-suite';
      let html = `<div class="test-suite-name">${suite.name}</div>`;
      for (const tc of suite.cases) {
        const cls = tc.pass ? 'test-pass' : 'test-fail';
        const icon = tc.pass ? '✓' : '✗';
        html += `<div class="test-case"><span class="${cls}">${icon}</span><span>${tc.name}</span>${tc.error ? `<span style="color:#e94560;font-size:9px"> — ${tc.error}</span>` : ''}</div>`;
        if (tc.pass) totalPass++; else totalFail++;
      }
      div.innerHTML = html;
      container.appendChild(div);
    }

    const summary = document.createElement('div');
    summary.className = 'test-summary';
    summary.style.color = totalFail > 0 ? '#e94560' : '#4ecca3';
    summary.textContent = `${totalPass} passed, ${totalFail} failed`;
    container.appendChild(summary);
  }
}

// ===== Assertion helpers =====
export function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

export function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export function assertRange(val, min, max, msg) {
  if (val < min || val > max) throw new Error(msg || `Expected ${val} to be in [${min}, ${max}]`);
}

export function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch(e) { threw = true; }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}
