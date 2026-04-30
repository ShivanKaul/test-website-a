# Test Website A

A collection of browser privacy and security tests, hosted on Cloudflare Pages at [test-website-a.pages.dev](https://test-website-a.pages.dev).

See also: [Test Website B](https://test-website-b.pages.dev).

## Tests

| Test | Description |
|------|-------------|
| [De-AMP Sec-Fetch-Site Bypass](de-amp/) | Tests whether De-AMP redirects preserve the cross-site hop in the `Sec-Fetch-Site` header. |
| [De-AMP Content-Disposition: attachment Bypass](de-amp-download/) | Tests that AMP pages served with `Content-Disposition: attachment` are downloaded, not De-AMPed. |
| [Noscript Subdomain Redirect](noscript-redirect/) | Tests whether browsers protect against `<noscript>`-based permanent redirects to a subdomain when JavaScript is disabled. |
| [Server-Side Redirect](server-redirect/) | Tests browser behavior on a server-side 302 redirect to a cross-site destination. |
| [Storage Access API](storage-access/) | Tests whether a cross-site iframe can regain access to its first-party cookies via the Storage Access API. |
| [Storage Quota Fingerprinting](storage-quota-fingerprint/) | Tests whether storage quota APIs leak different values in normal vs. private browsing, enabling incognito detection. |
| [Third-Party Cookies](third-party-cookies/) | Tests whether a cross-site iframe can read cookies set when its origin was top-level. |
| [Viewport Keyboard Resize](viewport-keyboard/) | Tests whether the browser incorrectly resizes the layout viewport when the virtual keyboard appears. |
| [Viewport Units (svh/lvh/dvh)](viewport-units/) | Tests whether the browser correctly distinguishes `svh`, `lvh`, and `dvh` viewport units on mobile. |
| [window.name Clearing](window-name-clearing/) | Tests whether the browser clears `window.name` on cross-origin navigations. |

## Structure

Each test lives in its own directory with an `index.html` and a `meta.json` (title + description). The root `index.html` is generated from those metadata files by `generate-index.sh`, which serves as the Cloudflare Pages build command.
