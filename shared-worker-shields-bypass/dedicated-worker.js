// Dedicated worker: opens the WebSocket from a worker global scope that still
// has a RenderFrameHost behind it, so Brave's WebSocket interception applies
// and a matching Shields filter blocks it (same as the page).

self.onmessage = (e) => {
  const wsUrl = e.data.wsUrl;
  let settled = false;
  const done = (status) => {
    if (settled) return;
    settled = true;
    self.postMessage({ status });
  };

  try {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => done('OPEN');
    ws.onerror = () => done('BLOCKED');
    ws.onclose = (ev) => done(ev.wasClean && ev.code === 1000 ? 'OPEN' : 'BLOCKED');
  } catch (err) {
    done('BLOCKED');
  }
};
