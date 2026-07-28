// Serves an AMP-looking page carrying "Content-Security-Policy: sandbox".
//
// De-AMP sniffs the text/html body for an `amp` attribute + <link rel=canonical>
// and force-navigates the top frame to the canonical URL. It never inspects the
// response's CSP header, so the `sandbox` directive (which should forbid the page
// from navigating the top-level frame) does not gate the redirect.
//
// The canonical URL below stands in for an attacker-controlled destination.
//
//   default          served WITH `Content-Security-Policy: sandbox`  (repro: Brave redirects)
//   ?csp=off         served WITHOUT the header                       (control: normal De-AMP)
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const withSandbox = url.searchParams.get('csp') !== 'off';

  // Canonical points at a different same-site path (an http(s) URL that differs
  // from the request URL and the referrer, so De-AMP's loop guards do not fire).
  const canonical = `${url.origin}/de-amp/csp-sandbox/landed.html`;

  // AMP markers De-AMP looks for: an `amp` attribute on a tag + a canonical link.
  // Both sit at the top so they land in the first sniffed body chunk.
  const html = `<!doctype html>
<html amp lang="en">
<head>
  <link rel="canonical" href="${canonical}" />
  <title>Sandboxed AMP page</title>
</head>
<body>
  <h1>Sandboxed "AMP" page</h1>
  <p>This response was served with${withSandbox ? '' : 'OUT'}
  <code>Content-Security-Policy: sandbox</code>.</p>
  <p>If De-AMP honored the sandbox directive you would still be on this URL.
  If you were bounced to <code>/de-amp/csp-sandbox/landed.html</code>, De-AMP
  performed a top-frame navigation that the sandbox should have blocked.</p>
</body>
</html>`;

  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  // CSP sandbox only takes effect as an HTTP header; it is ignored in a <meta> tag.
  // No allow-* flags => top-navigation (and scripts) are disallowed.
  if (withSandbox) {
    headers['Content-Security-Policy'] = 'sandbox';
  }

  return new Response(html, { headers });
}
