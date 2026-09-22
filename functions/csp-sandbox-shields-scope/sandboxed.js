// Serves a page carrying "Content-Security-Policy: sandbox allow-scripts", which
// gives the top-level document an opaque origin (window.origin === "null") while
// still letting its scripts run.
//
// Shields has no site to attach a per-site exception to on an opaque origin. The
// reported bug is that toggling "Block scripts" here writes to the global Shields
// defaults instead, so one sandboxed page can re-enable scripts for every site.
//
//   default    served WITH `Content-Security-Policy: sandbox allow-scripts`
//   ?csp=off   served WITHOUT the header (control: an ordinary same-origin page)
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
    <p class="small muted">A sandboxed document reports <code>null</code>; an
    ordinary one reports <code>${url.origin}</code>. <code>allow-scripts</code>
    is what keeps scripts running, so a blocked reading above means Shields is
    currently blocking scripts.</p>
  </div>

  <div class="card">
    <h2>Do this here</h2>
    <ol>
      <li>Open the Brave Shields panel for this page.</li>
      <li>Turn <b>Block scripts</b> off.</li>
      <li>Open <code>brave://settings/shields</code> and reload it. Check whether the
      global <b>Block Scripts</b> default is still on.</li>
      <li>Go back to the harness and reload it.</li>
    </ol>
    <p>CSP <code>sandbox</code> only applies as an HTTP header, so this page cannot
    be a static file; it is served by a Pages Function.</p>
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
