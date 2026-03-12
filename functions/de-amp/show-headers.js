// Cloudflare Pages Function that captures and displays Sec-Fetch-* headers
export async function onRequestGet(context) {
  const { request } = context;

  const headersOfInterest = [
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest',
    'sec-fetch-user',
    'referer',
    'origin',
  ];

  const captured = {};
  for (const name of headersOfInterest) {
    const value = request.headers.get(name);
    if (value !== null) {
      captured[name] = value;
    }
  }

  const secFetchSite = captured['sec-fetch-site'] || '(not present)';

  const referer = captured['referer'] || '';
  const cameFromSiteB = referer.includes('test-website-b');

  let verdictClass, verdictLabel, verdictMsg;
  if (secFetchSite === 'cross-site') {
    verdictClass = 'pass';
    verdictLabel = 'PASS';
    verdictMsg = 'Sec-Fetch-Site is <code>cross-site</code> (correct behavior)';
  } else if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    if (cameFromSiteB) {
      verdictClass = 'fail';
      verdictLabel = 'FAIL -- BUG CONFIRMED';
      verdictMsg = `Sec-Fetch-Site is <code>${secFetchSite}</code> (should be <code>cross-site</code> since you arrived via De-AMP from Site B)`;
    } else {
      verdictClass = 'info';
      verdictLabel = 'EXPECTED';
      verdictMsg = `Sec-Fetch-Site is <code>${secFetchSite}</code> (this is normal for a same-origin navigation -- use the <a href="/de-amp/">test page</a> to run the actual De-AMP test)`;
    }
  } else if (secFetchSite === 'none') {
    verdictClass = 'info';
    verdictLabel = 'INFO';
    verdictMsg = 'Sec-Fetch-Site is <code>none</code> (direct navigation / typed URL)';
  } else {
    verdictClass = 'info';
    verdictLabel = 'INFO';
    verdictMsg = `Sec-Fetch-Site is <code>${secFetchSite}</code>`;
  }

  let headerRows = '';
  for (const [name, value] of Object.entries(captured).sort()) {
    headerRows += `<tr><td>${name}</td><td><code>${value}</code></td></tr>\n`;
  }
  if (headerRows === '') {
    headerRows = '<tr><td colspan="2"><em>No Sec-Fetch-* headers found</em></td></tr>';
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Header Inspector -- De-AMP Test</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.45; margin: 0; padding: 18px; max-width: 800px; margin: 0 auto; }
    .card { border: 1px solid rgba(127,127,127,0.28); border-radius: 14px; padding: 12px; margin: 12px 0; background: rgba(127,127,127,0.06); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(127,127,127,0.14); padding: 2px 6px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid rgba(127,127,127,0.28); padding: 8px 12px; text-align: left; }
    th { background: rgba(127,127,127,0.1); }
    .pass { border-color: rgba(0,160,0,0.7); background: rgba(0,160,0,0.08); }
    .fail { border-color: rgba(200,0,0,0.7); background: rgba(200,0,0,0.08); }
    .info { border-color: rgba(200,140,0,0.7); background: rgba(200,140,0,0.08); }
    .verdict { font-size: 1.2em; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Header Inspector -- De-AMP Test</h1>
  <p>Site A: <code>test-website-a.pages.dev</code></p>

  <div class="card ${verdictClass}">
    <p class="verdict"><strong>${verdictLabel}:</strong> ${verdictMsg}</p>
  </div>

  <div class="card">
    <h2>Request Headers</h2>
    <table>
      <tr><th>Header</th><th>Value</th></tr>
      ${headerRows}
    </table>
  </div>

  <div class="card">
    <h2>Navigation Info (client-side)</h2>
    <table>
      <tr><th>Property</th><th>Value</th></tr>
      <tr><td>document.referrer</td><td id="referrer"></td></tr>
      <tr><td>window.location.href</td><td id="location"></td></tr>
    </table>
  </div>

  <p><a href="/de-amp/">Back to test page</a></p>

  <script>
    document.getElementById('referrer').textContent = document.referrer || '(empty)';
    document.getElementById('location').textContent = window.location.href;
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
