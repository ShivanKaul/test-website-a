// Shared worker: frameless, so Brave skips WebSocket interception (the bypass).

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

self.onconnect = (e) => {
  const port = e.ports[0];
  port.onmessage = (msg) => {
    connect(msg.data.wsBase, msg.data.ctx, (status) => port.postMessage({ status }));
  };
  port.start();
};
