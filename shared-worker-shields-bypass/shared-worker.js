// Shared worker: opens the WebSocket from a SharedWorkerGlobalScope. Per the
// report, Brave only installs its WebSocket proxy when Chromium supplies a
// non-null RenderFrameHost (BraveContentBrowserClient::WillInterceptWebSocket
// returns frame != nullptr). A SharedWorker has no RenderFrameHost, so the
// socket takes the frameless path, BraveProxyingWebSocket is never created,
// the adblock engines never see the request, and the connection succeeds even
// when a default Shields filter would block the same endpoint from the page.

self.onconnect = (e) => {
  const port = e.ports[0];
  port.onmessage = (msg) => {
    const wsUrl = msg.data.wsUrl;
    let settled = false;
    const done = (status) => {
      if (settled) return;
      settled = true;
      port.postMessage({ status });
    };

    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => done('OPEN');
      ws.onerror = () => done('ERROR');
      ws.onclose = (ev) => done(ev.wasClean && ev.code === 1000 ? 'OPEN' : 'ERROR');
    } catch (err) {
      done('ERROR');
    }
  };
  port.start();
};
