// Cloudflare Pages middleware that injects a "← All tests" home link into
// every HTML page except the root index, using HTMLRewriter.

class InjectHomeLink {
  element(el) {
    el.prepend('<a class="home-link" href="/">← All tests</a>', { html: true });
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);

  // Don't inject on the root index page itself.
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  return new HTMLRewriter().on("body", new InjectHomeLink()).transform(response);
}
