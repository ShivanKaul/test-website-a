self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function testFetch(url, report) {
  try {
    await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(),
      { cache: 'no-store', mode: 'no-cors' });
    report('ALLOWED');
  } catch (e) {
    report('BLOCKED');
  }
}

function testImportScripts(url, report) {
  // importScripts throws on both a network block and a script execution error,
  // so probe the network layer with a no-cors fetch first to tell them apart.
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  fetch(u, { cache: 'no-store', mode: 'no-cors' }).then(() => {
    try {
      self.importScripts(u);
    } catch (e) {}
    report('ALLOWED');
  }).catch(() => report('BLOCKED'));
}

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  const report = (status) => port && port.postMessage({ status });
  if (e.data.method === 'importScripts') {
    testImportScripts(e.data.url, report);
  } else {
    testFetch(e.data.url, report);
  }
});
