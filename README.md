# Test Website A

A collection of browser privacy and security tests, hosted on Cloudflare Pages at [test-website-a.pages.dev](https://test-website-a.pages.dev).

See also: [Test Website B](https://test-website-b.pages.dev).

## Structure

Each test lives in its own directory with an `index.html` and a `meta.json` (title + description). The root `index.html` is generated from those metadata files by `generate-index.sh`, which serves as the Cloudflare Pages build command.
