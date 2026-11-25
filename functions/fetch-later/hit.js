// GET /fetch-later/hit?k=<key> sets cookie fl_<key>=1 so the page can tell
// the request arrived. Reached through a 302 from site B's beacon.

export async function onRequest({ request }) {
  const k = new URL(request.url).searchParams.get('k') || '';
  if (!/^[a-z0-9_]{1,64}$/.test(k)) return new Response(null, { status: 400 });
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': `fl_${k}=1; Path=/; Max-Age=600; Secure; SameSite=None`,
      'Cache-Control': 'no-store',
    },
  });
}
