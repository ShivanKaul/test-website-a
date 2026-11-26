#!/usr/bin/env python3
"""Local HTTPS reproduction of cross-site DBSC state in third-party frames."""

from __future__ import annotations

import argparse
import json
import secrets
import ssl
import threading
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit


HOST_STEPS = {"a.localhost": 1, "b.localhost": 2, "c.localhost": 3}
TRACKER_HOST = "t.localhost"
COOKIE_ATTRIBUTES = "Secure; SameSite=None; Path=/; HttpOnly"
ROOT = Path(__file__).resolve().parent


class TestServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int]):
        super().__init__(address, Handler)
        self.pending: set[str] = set()
        self.registered: set[str] = set()
        self.refresh_challenges: dict[str, str] = {}
        self.events: deque[dict[str, object]] = deque(maxlen=1000)
        self.state_lock = threading.Lock()

    def record(self, event: dict[str, object]) -> None:
        with self.state_lock:
            self.events.append(event)
        print(json.dumps(event, sort_keys=True), flush=True)


class Handler(BaseHTTPRequestHandler):
    server: TestServer
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:
        # Each meaningful request is recorded as one structured line below.
        pass

    @property
    def host(self) -> str:
        return self.headers.get("Host", "").split(":", 1)[0].lower()

    @property
    def cookies(self) -> dict[str, str]:
        parsed = SimpleCookie()
        try:
            parsed.load(self.headers.get("Cookie", ""))
        except Exception:
            return {}
        return {name: morsel.value for name, morsel in parsed.items()}

    def event(self, kind: str, **details: object) -> None:
        cookies = self.cookies
        self.server.record(
            {
                "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "kind": kind,
                "host": self.host,
                "method": self.command,
                "path": urlsplit(self.path).path,
                "dbsc_cookie": cookies.get("dbsc_id"),
                "ordinary_cookie": cookies.get("ordinary_id"),
                "session_id_header": self.headers.get("Sec-Secure-Session-Id"),
                "has_signed_response": bool(self.headers.get("Secure-Session-Response")),
                "sec_fetch_site": self.headers.get("Sec-Fetch-Site"),
                "sec_fetch_dest": self.headers.get("Sec-Fetch-Dest"),
                **details,
            }
        )

    def send_bytes(
        self,
        status: HTTPStatus,
        body: bytes = b"",
        content_type: str = "text/plain; charset=utf-8",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def send_json(
        self,
        status: HTTPStatus,
        value: object,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_bytes(
            status,
            json.dumps(value, separators=(",", ":")).encode("utf-8"),
            "application/json; charset=utf-8",
            headers,
        )

    def send_html(
        self,
        html: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_bytes(
            HTTPStatus.OK, html.encode("utf-8"), "text/html; charset=utf-8", headers
        )

    def do_GET(self) -> None:
        if self.host not in {*HOST_STEPS, TRACKER_HOST}:
            self.send_bytes(HTTPStatus.MISDIRECTED_REQUEST)
            return

        parsed = urlsplit(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/favicon.ico":
            self.send_bytes(HTTPStatus.NO_CONTENT)
        elif path == "/styles.css":
            self.send_bytes(
                HTTPStatus.OK,
                (ROOT.parent / "styles.css").read_bytes(),
                "text/css; charset=utf-8",
            )
        elif path in {"/", "/top"} and self.host in HOST_STEPS:
            step = HOST_STEPS[self.host]
            self.event("top", step=step)
            self.send_html(top_page(step, self.server.server_port))
        elif path == "/frame" and self.host == TRACKER_HOST:
            step = query.get("step", [""])[0]
            if step not in {"1", "2", "3"}:
                self.send_bytes(HTTPStatus.BAD_REQUEST, b"Unknown step")
                return
            headers: dict[str, str] = {}
            if step == "1":
                existing_id = self.cookies.get("dbsc_id")
                with self.server.state_lock:
                    known = existing_id in self.server.registered
                sid = existing_id if known else secrets.token_urlsafe(18)
                headers["Set-Cookie"] = f"ordinary_id={sid}; {COOKIE_ATTRIBUTES}"
                if not known:
                    with self.server.state_lock:
                        self.server.pending.add(sid)
                    headers["Secure-Session-Registration"] = (
                        f'(ES256);challenge="local-test";path="/register?sid={quote(sid)}"'
                    )
                self.event("frame", step=step, offered_registration=not known)
            else:
                # No ID, Set-Cookie, or registration header is sent under B/C.
                self.event("frame", step=step, offered_registration=False)
            self.send_html(frame_page(), headers)
        elif path == "/probe" and self.host == TRACKER_HOST:
            cookies = self.cookies
            self.event("probe")
            # The response derives both IDs solely from this request's Cookie header.
            self.send_json(
                HTTPStatus.OK,
                {
                    "dbsc": cookies.get("dbsc_id"),
                    "ordinary": cookies.get("ordinary_id"),
                },
            )
        elif path == "/debug/events":
            with self.server.state_lock:
                events = list(self.server.events)
            self.send_json(HTTPStatus.OK, {"events": events})
        else:
            self.send_bytes(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if self.host != TRACKER_HOST:
            self.send_bytes(HTTPStatus.MISDIRECTED_REQUEST)
            return
        path = urlsplit(self.path).path
        body_length = int(self.headers.get("Content-Length", "0"))
        if body_length > 65536:
            self.send_bytes(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return
        self.rfile.read(body_length)

        if path == "/register":
            query = parse_qs(urlsplit(self.path).query)
            sid = query.get("sid", [""])[0]
            with self.server.state_lock:
                pending = sid in self.server.pending
            self.event("register", sid=sid if pending else None, accepted=pending)
            if not pending or not self.headers.get("Secure-Session-Response"):
                self.send_bytes(HTTPStatus.BAD_REQUEST)
                return
            with self.server.state_lock:
                self.server.registered.add(sid)
            self.send_json(
                HTTPStatus.OK,
                session_instruction(sid, self.server.server_port),
                {"Set-Cookie": f"dbsc_id={sid}; {COOKIE_ATTRIBUTES}"},
            )
        elif path == "/refresh":
            sid = self.headers.get("Sec-Secure-Session-Id", "")
            with self.server.state_lock:
                known = sid in self.server.registered
            if not known:
                self.event("refresh_rejected", accepted=False)
                self.send_bytes(HTTPStatus.BAD_REQUEST)
                return
            if not self.headers.get("Secure-Session-Response"):
                challenge = secrets.token_urlsafe(18)
                with self.server.state_lock:
                    self.server.refresh_challenges[sid] = challenge
                self.event("refresh_challenge", sid=sid)
                self.send_bytes(
                    HTTPStatus.FORBIDDEN,
                    headers={
                        "Secure-Session-Challenge": f'"{challenge}";id="{sid}"'
                    },
                )
                return
            with self.server.state_lock:
                challenged = sid in self.server.refresh_challenges
            self.event("refresh", sid=sid, accepted=challenged)
            if not challenged:
                self.send_bytes(HTTPStatus.BAD_REQUEST)
                return
            self.send_json(
                HTTPStatus.OK,
                session_instruction(sid, self.server.server_port),
                {"Set-Cookie": f"dbsc_id={sid}; {COOKIE_ATTRIBUTES}"},
            )
        else:
            self.send_bytes(HTTPStatus.NOT_FOUND)


def session_instruction(sid: str, port: int) -> dict[str, object]:
    origin = f"https://{TRACKER_HOST}:{port}"
    return {
        "session_identifier": sid,
        "refresh_url": f"{origin}/refresh",
        "scope": {"origin": origin, "include_site": False},
        "credentials": [
            {
                "type": "cookie",
                "name": "dbsc_id",
                "attributes": COOKIE_ATTRIBUTES,
            }
        ],
        "allowed_refresh_initiators": ["*"],
    }


def top_page(step: int, port: int) -> str:
    tracker_origin = f"https://{TRACKER_HOST}:{port}"
    links = "".join(
        f'<li><a href="https://{host}:{port}/?step={number}">'
        f'Step {number}: {host}</a></li>'
        for host, number in HOST_STEPS.items()
    )
    config = json.dumps({"step": step, "trackerOrigin": tracker_origin})
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DBSC cross-site partitioning test: step {step}</title>
  <link rel="stylesheet" href="/styles.css">
  <style>
    body {{ max-width: 850px; }}
    iframe {{ width: 100%; height: 210px; border: 1px solid var(--line); border-radius: 8px; }}
    .id {{ font: 0.95em var(--font-mono); overflow-wrap: anywhere; }}
  </style>
</head>
<body>
  <h1>DBSC cross-site partitioning test</h1>
  <p>This page is <code>{list(HOST_STEPS)[step - 1]}</code>. Its embedded tracker is
  <code>{TRACKER_HOST}</code>. Each top-level host is a separate site.</p>
  <div class="card">
    <h2>Run order</h2>
    <ol>{links}</ol>
    <p>Use a fresh browser profile with default Brave Shields. Open A first,
    then B in the same tab. For C, quit and restart the browser without
    stopping this server, then open C in the same profile.</p>
    <p>Compare the identifiers shown on A, B, and C. A repeated DBSC ID with
    the ordinary cookie absent on B/C demonstrates the bypass. The tracker
    sends no identifier in the page or URL under B/C.</p>
  </div>
  <div class="card">
    <h2>Tracker frame</h2>
    <iframe id="tracker" title="Third-party tracker test frame"></iframe>
    <p id="status" class="status">Waiting for tracker response…</p>
    <pre id="iframe-result">Waiting for tracker response…</pre>
    <button id="retry" type="button">Reload tracker frame</button>
  </div>
  <details>
    <summary>What the two identifiers mean</summary>
    <p><strong>DBSC cookie ID</strong> is set by the browser's DBSC registration
    or refresh POST. <strong>Ordinary cookie ID</strong> is set only on A's
    iframe response. Both are HttpOnly; the tracker server reports only the
    cookies attached to each probe request.</p>
    <p>The local request log is at <a href="/debug/events">/debug/events</a>.
    Look for a <code>refresh</code> POST carrying the same
    <code>session_id_header</code> after visiting B or C.</p>
  </details>
  <script>
    const config = {config};
    const frame = document.getElementById("tracker");
    const result = document.getElementById("iframe-result");
    const status = document.getElementById("status");
    function loadFrame() {{
      status.textContent = "Checking tracker cookies…";
      result.textContent = "Checking…";
      result.dataset.state = "checking";
      const url = new URL("/frame", config.trackerOrigin);
      url.searchParams.set("step", config.step);
      url.searchParams.set("parent_origin", location.origin);
      url.searchParams.set("attempt", crypto.randomUUID());
      frame.src = url.href;
    }}
    window.addEventListener("message", event => {{
      if (event.origin !== config.trackerOrigin || event.source !== frame.contentWindow) return;
      if (event.data?.type !== "dbsc-probe" || event.data.step !== String(config.step)) return;
      const data = event.data;
      result.dataset.state = data.dbsc || data.error || data.attempts >= 12
        ? "done" : "checking";
      result.textContent = JSON.stringify({{
        dbsc: data.dbsc,
        ordinary: data.ordinary,
        attempts: data.attempts,
        error: data.error || null
      }}, null, 2);
      status.textContent = data.error
        ? `Probe failed: ${{data.error}}`
        : data.dbsc
          ? `DBSC cookie ID: ${{data.dbsc}}; ordinary cookie ID: ${{data.ordinary || "absent"}}`
          : `DBSC cookie absent; ordinary cookie ID: ${{data.ordinary || "absent"}}`;
    }});
    document.getElementById("retry").addEventListener("click", loadFrame);
    loadFrame();
  </script>
</body>
</html>"""


def frame_page() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/styles.css">
  <title>Third-party DBSC frame</title>
</head>
<body>
  <p><strong>Third-party frame:</strong> <code>t.localhost</code></p>
  <p id="status">Checking cookies through a same-origin request…</p>
  <pre id="result">Checking…</pre>
  <script>
    const params = new URLSearchParams(location.search);
    const step = params.get("step");
    const parentOrigin = params.get("parent_origin");
    let allowed = false;
    try {
      const origin = new URL(parentOrigin);
      allowed = origin.protocol === "https:"
        && ["a.localhost", "b.localhost", "c.localhost"].includes(origin.hostname)
        && origin.port === location.port;
    } catch {}
    let attempts = 0;
    async function probe() {
      attempts += 1;
      try {
        const response = await fetch("/probe", {credentials: "include", cache: "no-store"});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const result = {type: "dbsc-probe", step, ...data, attempts};
        document.getElementById("result").textContent = JSON.stringify(data, null, 2);
        document.getElementById("status").textContent = data.dbsc
          ? "DBSC ID received from cookie on the probe request."
          : "No DBSC cookie on the probe request yet.";
        if (allowed) parent.postMessage(result, parentOrigin);
        if (!data.dbsc && attempts < 12) setTimeout(probe, 500);
      } catch (error) {
        const message = String(error);
        document.getElementById("status").textContent = message;
        if (allowed) parent.postMessage({type: "dbsc-probe", step, error: message, attempts}, parentOrigin);
      }
    }
    probe();
  </script>
</body>
</html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--cert", type=Path, default=ROOT / "cert.pem")
    parser.add_argument("--key", type=Path, default=ROOT / "key.pem")
    args = parser.parse_args()

    server = TestServer(("127.0.0.1", args.port))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(args.cert, args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"Serving https://a.localhost:{args.port}/?step=1", flush=True)
    print(f"Request log: https://a.localhost:{args.port}/debug/events", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
