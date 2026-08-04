// Service worker: frameless like a shared worker, so Brave skips WebSocket
// interception (same bypass). Replies on the MessagePort the page provides.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function connect(wsBase, ctx, report) {
  let ws;
  let settled = false;
  const done = (status) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { ws && ws.close(1000); } catch (e) {}
    report(status);
  };
  const timer = setTimeout(() => done('TIMEOUT'), 5000);
  try {
    ws = new WebSocket(wsBase + '?ctx=' + ctx);
    ws.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data);
        done(d.hello === true && d.ctx === ctx ? 'OPEN' : 'BLOCKED');
      } catch (e) { done('BLOCKED'); }
    };
    ws.onerror = () => done('BLOCKED');
    ws.onclose = () => done('BLOCKED');
  } catch (e) { done('BLOCKED'); }
}

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  connect(e.data.wsBase, e.data.ctx, (status) => port && port.postMessage({ status }));
});
