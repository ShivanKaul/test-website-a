// Cloudflare Pages middleware that injects shared markup into every HTML page
// using HTMLRewriter, so individual pages don't need to repeat boilerplate.
//
// Injected into <head>:
//   - <meta charset="utf-8">
//   - <meta name="viewport" …>
//   - <link rel="stylesheet" href="/styles.css">
//
// Injected into <body> (non-index pages only):
//   - "← All tests" home link

const HEAD_BOILERPLATE = [
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  '<link rel="stylesheet" href="/styles.css" />',
].join("\n");

class InjectHead {
  element(el) {
    el.prepend(HEAD_BOILERPLATE, { html: true });
  }
}

class InjectHomeLink {
  element(el) {
    el.prepend('<a class="home-link" href="/">← All tests</a>', { html: true });
  }
}

export async function onRequest(context) {
  const response = await context.next();

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const url = new URL(context.request.url);
  const isIndex = url.pathname === "/" || url.pathname === "/index.html";

  const rewriter = new HTMLRewriter().on("head", new InjectHead());
  if (!isIndex) {
    rewriter.on("body", new InjectHomeLink());
  }

  return rewriter.transform(response);
}
