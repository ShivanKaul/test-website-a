# DBSC cross-site state test

## Public two-site version

The deployed test starts at
[test-website-a.pages.dev/dbsc-partitioning/](https://test-website-a.pages.dev/dbsc-partitioning/).
Website A embeds Website B. Website B's Cloudflare Pages Functions issue the
DBSC registration, challenge, refresh, and cookie-probe responses.

The page offers two separate flows, each requiring a fresh browser profile:

1. **Third-party seed:** On A, choose seed mode to embed B's seed page. Then
   visit B's observe page top-level. If the DBSC ID repeats while the ordinary
   cookie is absent, state created in A's third-party partition became visible
   on B.
2. **First-party seed:** Visit B's seed page top-level. Then return to A in
   `?mode=observe`, which embeds B without issuing a new registration. If the
   DBSC ID repeats while the ordinary cookie is absent, B can recognize that
   profile while embedded on A.

The two public sites demonstrate transfer between first-party and third-party
contexts. The reporter's stronger sequence, where the same tracker is a third
party under several unrelated top-level sites, requires a third public host.
The local test below supplies that sequence and checks persistence after a
browser restart.

## Local four-host version

This local HTTPS website tests whether a Device Bound Session Credentials
(DBSC) session registered in a third-party iframe is reused when the same
tracker is embedded under a different top-level site. It uses four hosts:
`a.localhost`, `b.localhost`, `c.localhost`, and `t.localhost`, all on port 8001.
The server binds only to `127.0.0.1` and requires no Python packages.

## Start the site

From this directory:

```sh
mkcert -cert-file cert.pem -key-file key.pem \
  a.localhost b.localhost c.localhost t.localhost
python3 server.py
```

In a second terminal, run `./open-brave.sh 1`. It opens an isolated Brave
profile and accepts only this test certificate's public key, so it does not
require changing the system trust store. Run `./open-brave.sh 3` after quitting
Brave for the restart check. Delete `.brave-profile/` before a new run. The
certificate, private key, and test profile are ignored by Git.

If using an existing browser profile instead, run `mkcert -install` first and
make sure the browser trusts the certificate. DBSC silently ignores its
registration header if the HTTPS connection has a certificate error.

`open-brave.sh` also maps the four `.localhost` names to `127.0.0.1`. If using
another browser, map those names in its launch options or local hosts file.

## Run the test

1. In the fresh Brave profile opened by `open-brave.sh`, open
   [step A](https://a.localhost:8001/?step=1). Wait until the frame shows a
   DBSC cookie ID. Its ordinary cookie ID should match.
2. Use the link on the page to open
   [step B](https://b.localhost:8001/?step=2) in the **same tab**. The ordinary
   cookie should be absent. A repeated DBSC cookie ID means the browser
   restored the tracker identifier across top-level sites.
3. Quit Brave, restart it with the same profile while keeping the server
   running, and open [step C](https://c.localhost:8001/?step=3). A repeated
   DBSC ID here shows that the cross-site identifier survives a restart.

The page at B/C never sends a session ID or registration header. Its displayed
ID is derived only from the `Cookie` header attached to the tracker's
`/probe` request. The [request log](https://a.localhost:8001/debug/events)
also shows each DBSC refresh POST and its `session_id_header`. The signed
response itself is deliberately not logged.

For a comparison, repeat with a fresh Chrome profile and third-party cookies
blocked. The registration POST may still appear in the request log, but a
blocked cookie should prevent the DBSC session from becoming usable.

For an automated local comparison, run `node verify.mjs --browser both` while
the Python server is running. The script launches separate temporary profiles,
blocks third-party cookies in Chrome, and checks A, B, and C across a browser
restart. It uses only Node built-ins.

Only use a fresh profile for each new run. Existing DBSC sessions for
`t.localhost` can affect the result. Restarting the Python server also clears
its registry of issued IDs, so leave it running through step C.
