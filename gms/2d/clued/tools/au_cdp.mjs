// Minimal CDP driver for AU browser checks (headless Chrome started with `~/.claude/bin/cdp start --port 9405`).
export async function connect(port = 9405) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page') || (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json());
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Page.enable');
  const logs = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  async function evaluate(expr, timeout = 60000) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function goto(url, waitExpr = 'document.readyState === "complete"', ms = 20000) {
    await send('Page.navigate', { url });
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 250));
      try { if (await evaluate(waitExpr)) return true; } catch {}
    }
    throw new Error('timeout waiting for ' + waitExpr);
  }
  async function screenshot(file, w = 384, hgt = 854, dpr = 2) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: dpr, mobile: w < 600 });
    await new Promise((r) => setTimeout(r, 400));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(file, Buffer.from(data, 'base64'));
  }
  return { send, evaluate, goto, screenshot, logs, close: () => ws.close() };
}
