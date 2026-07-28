// Baseline control: a NON-AMP page that tries a <meta http-equiv="refresh">
// navigation while served with "Content-Security-Policy: sandbox".
//
// This proves the sandbox header is honored for ordinary navigation: both Brave
// and Chrome should REFUSE the refresh (console: "... document is sandboxed").
// Contrast with sandbox-amp, which De-AMP navigates anyway.
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = `${url.origin}/de-amp/csp-sandbox/landed.html`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta http-equiv="refresh" content="2;url=${target}" />
  <title>Sandboxed meta-refresh</title>
</head>
<body>
  <h1>Sandboxed meta-refresh (control)</h1>
  <p>This page is served with <code>Content-Security-Policy: sandbox</code> and
  contains a <code>&lt;meta http-equiv="refresh"&gt;</code> to
  <code>/de-amp/csp-sandbox/landed.html</code>.</p>
  <p>Because of the sandbox, the browser should <b>refuse</b> this navigation and
  you should stay here. Open the console to see the refusal message.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': 'sandbox',
    },
  });
}
