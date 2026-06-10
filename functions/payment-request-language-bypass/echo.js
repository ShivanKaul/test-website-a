// Echoes back the Accept-Language header the server received for a normal
// page-initiated fetch(). With the language-fingerprinting protection on, this
// is the REDUCED header (single language), because page subresource requests go
// through BraveProxyingURLLoaderFactory. This is the baseline to compare the
// payment-manifest fetch against.

export async function onRequestGet(context) {
  const { request } = context;
  return new Response(
    JSON.stringify({ acceptLanguage: request.headers.get('accept-language') }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}
