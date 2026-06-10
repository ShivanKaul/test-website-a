// Polled by the page to read back the Accept-Language that the browser-process
// payment-manifest fetch sent to /payment-request-language-bypass/pmh/<token>.

function storeKey(request, token) {
  return new Request(new URL('/__plb_store/' + token, request.url).toString());
}

export async function onRequestGet(context) {
  const { request, params } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  const hit = await caches.default.match(storeKey(request, params.token));
  if (!hit) {
    return new Response(JSON.stringify({ pending: true }), { headers });
  }

  const data = await hit.json();
  return new Response(JSON.stringify({ pending: false, ...data }), { headers });
}
