// Server-side WebSocket endpoint for the SharedWorker Shields-bypass test.
//
// Cloudflare Pages Functions run on the Workers runtime, which can accept a
// WebSocket via WebSocketPair. We accept the upgrade, then immediately send
// back the context label the client encoded in the ?ctx= query param, so the
// page can prove which initiator (page / dedicated-worker / shared-worker)
// actually reached the server. If Shields blocks a given initiator, that
// socket never connects and the page shows ERROR for it.
//
// The client points a filtered hostname (e.g. googleadservices.com) at this
// origin so a default Shields network filter matches the request. Whichever
// initiators are intercepted by Brave are blocked; whichever take the
// frameless path connect and echo back here.

export async function onRequest(context) {
  const { request } = context;

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade request.', { status: 426 });
  }

  const url = new URL(request.url);
  const ctx = url.searchParams.get('ctx') || 'unknown';

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();
  server.addEventListener('message', (event) => {
    server.send(JSON.stringify({ echo: event.data, ctx }));
  });
  // Announce which initiator reached the server as soon as it connects.
  server.send(JSON.stringify({ hello: true, ctx }));

  return new Response(null, { status: 101, webSocket: client });
}
