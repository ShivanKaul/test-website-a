// WebSocket endpoint: on connect, sends {hello:true, ctx} echoing the ?ctx=
// label so the client can prove which initiator reached the server.

export async function onRequest(context) {
  const { request } = context;
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade request.', { status: 426 });
  }

  const ctx = new URL(request.url).searchParams.get('ctx') || 'unknown';
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ hello: true, ctx }));

  return new Response(null, { status: 101, webSocket: client });
}
