// CSP sandbox only applies as an HTTP header, so this page cannot be a static file.
// ?csp=off serves it without the header as a control.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const withSandbox = url.searchParams.get('csp') !== 'off';
  const CSP = 'sandbox allow-scripts';

  const html = `<!doctype html>
<html lang="en">
<head>
  <title>${withSandbox ? 'Sandboxed' : 'Control'} page &ndash; CSP Sandbox Shields Scope</title>
</head>
<body>
  <h1>${withSandbox ? 'CSP-sandboxed page' : 'Control page (no sandbox)'}</h1>

  <div class="card">
    <p>This response was served ${withSandbox
      ? `with <code>Content-Security-Policy: ${CSP}</code>.`
      : 'with no <code>Content-Security-Policy</code> header.'}</p>
    <table>
      <tr><th>Document origin</th><td id="origin" class="muted">unknown (scripts are blocked here)</td></tr>
    </table>
    <p class="small muted">Sandboxed: <code>null</code>. Ordinary:
    <code>${url.origin}</code>. A blocked reading means Shields is blocking scripts.</p>
  </div>

  <div class="card">
    <h2>Do this here</h2>
    <ol>
      <li>Shields panel for this page: turn <b>Block scripts</b> off.</li>
      <li>Reload <code>brave://settings/shields</code>: is the global
      <b>Block Scripts</b> default still on?</li>
      <li>Back button, then reload the harness.</li>
    </ol>
  </div>

  <script>
    document.getElementById('origin').textContent = window.origin;
    document.getElementById('origin').className = '';
  </script>
</body>
</html>`;

  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (withSandbox) {
    headers['Content-Security-Policy'] = CSP;
  }

  return new Response(html, { headers });
}
