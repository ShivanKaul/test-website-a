// Same-origin 302 hop for the referrer cap test.
//
// GET /referrer-cap/go?as=<json|svg|html>&id=<token>[&rp=<policy>]
//
// Redirects to the Referer echo on site B. The destination is fixed (only
// `as` and `id` are forwarded), so this is not an open redirect. If `rp` is a
// valid referrer policy token, the 302 carries it as a Referrer-Policy header,
// which updates the request's policy for the next hop.

const ECHO = 'https://test-website-b.pages.dev/referrer-cap/echo';

const POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const dest = new URL(ECHO);
  for (const key of ['as', 'id']) {
    const value = url.searchParams.get(key);
    if (value) dest.searchParams.set(key, value);
  }

  const headers = {
    Location: dest.href,
    'Cache-Control': 'no-store',
  };
  const rp = url.searchParams.get('rp');
  if (rp && POLICIES.has(rp)) {
    headers['Referrer-Policy'] = rp;
  }

  return new Response(null, { status: 302, headers });
}
