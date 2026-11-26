#!/usr/bin/env node

// Run the local DBSC demonstration in isolated Brave and Chrome profiles.
// Only Node built-ins are used, including its WebSocket client for DevTools.

import { spawn, spawnSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const BINARIES = {
  brave: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
};

const HOST_RULES = ["a", "b", "c", "t"]
  .map((host) => `MAP ${host}.localhost 127.0.0.1`)
  .join(", ");

function usage() {
  console.log(`Usage: node verify.mjs [options]

Options:
  --browser brave|chrome|both  Browser to test (default: both)
  --port N                     Local HTTPS port (default: 8001)
  --ca PATH                    mkcert rootCA.pem path (detected by default)
  --cert PATH                  Server certificate (default: ./cert.pem)
  --headed                     Show browser windows (default: headless)
  --no-restart                 Visit C without restarting the browser
  --keep-profiles              Retain the temporary browser profiles
  --wait-ms N                  Maximum wait for each page result (default: 20000)
  --help                       Show this help

Start server.py with its mkcert certificate before running this script.
The browser exception is limited to that certificate's SPKI fingerprint.
The server must expose /debug/events as JSON with an events array.`);
}

function parseArgs(args) {
  const options = {
    browser: "both",
    port: 8001,
    ca: null,
    cert: join(HERE, "cert.pem"),
    headed: false,
    restart: true,
    keepProfiles: false,
    waitMs: 20000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--browser") {
      options.browser = args[++i];
    } else if (arg === "--port") {
      options.port = Number(args[++i]);
    } else if (arg === "--ca") {
      options.ca = args[++i];
    } else if (arg === "--cert") {
      options.cert = args[++i];
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--no-restart") {
      options.restart = false;
    } else if (arg === "--keep-profiles") {
      options.keepProfiles = true;
    } else if (arg === "--wait-ms") {
      options.waitMs = Number(args[++i]);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["brave", "chrome", "both"].includes(options.browser)) {
    throw new Error("--browser must be brave, chrome, or both");
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("--port must be between 1 and 65535");
  }
  if (!Number.isInteger(options.waitMs) || options.waitMs < 1000) {
    throw new Error("--wait-ms must be at least 1000");
  }
  return options;
}

function findCaPath(explicitPath) {
  if (explicitPath) return explicitPath;
  const result = spawnSync("mkcert", ["-CAROOT"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("Cannot find mkcert CA; pass --ca /path/to/rootCA.pem");
  }
  return join(result.stdout.trim(), "rootCA.pem");
}

function spkiFingerprint(certPath) {
  const certificate = new X509Certificate(readFileSync(certPath));
  const spki = certificate.publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(spki).digest("base64");
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getEvents(port, ca) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/debug/events",
        servername: "a.localhost",
        headers: { Host: `a.localhost:${port}` },
        ca,
        timeout: 10000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) {
              throw new Error(`/debug/events returned HTTP ${response.statusCode}`);
            }
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!Array.isArray(data.events)) {
              throw new Error("/debug/events response lacks an events array");
            }
            resolve(data.events);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("/debug/events timed out")));
    request.on("error", reject);
  });
}

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("DevTools connection closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DevTools connection timed out")), 10000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("DevTools WebSocket failed to open"));
      }, { once: true });
    });
    return new DevTools(socket);
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) return;
    const { resolve, reject, timer } = this.pending.get(message.id);
    clearTimeout(timer);
    this.pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message} (${message.error.code})`));
    } else {
      resolve(message.result ?? {});
    }
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = 15000) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

async function launchBrowser(kind, profile, options) {
  const binary = BINARIES[kind];
  if (!existsSync(binary)) throw new Error(`Browser not found: ${binary}`);

  // A fresh Chrome profile with the explicit "Block third-party cookies" mode.
  if (kind === "chrome" && !existsSync(join(profile, "Default", "Preferences"))) {
    mkdirSync(join(profile, "Default"), { recursive: true });
    writeFileSync(
      join(profile, "Default", "Preferences"),
      JSON.stringify({ profile: { cookie_controls_mode: 1 } }),
    );
  }

  const activePortPath = join(profile, "DevToolsActivePort");
  rmSync(activePortPath, { force: true });
  const args = [
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--ignore-certificate-errors-spki-list=${options.spkiFingerprint}`,
    `--host-resolver-rules=${HOST_RULES}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];
  if (!options.headed) args.push("--headless=new");
  args.push("about:blank");

  const processHandle = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let spawnError = null;
  processHandle.on("error", (error) => { spawnError = error; });
  processHandle.stderr.on("data", (data) => {
    stderr = (stderr + data.toString("utf8")).slice(-4000);
  });

  try {
    const deadline = Date.now() + 20000;
    let port;
    while (Date.now() < deadline) {
      if (existsSync(activePortPath)) {
        port = Number(readFileSync(activePortPath, "utf8").split(/\s+/)[0]);
        if (Number.isInteger(port) && port > 0) break;
      }
      if (spawnError) throw spawnError;
      if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
        throw new Error(`${kind} exited during startup: ${stderr}`);
      }
      await sleep(150);
    }
    if (!port) {
      throw new Error(`${kind} did not start DevTools: ${stderr}`);
    }

    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const devtools = await DevTools.connect(info.webSocketDebuggerUrl);
    return { processHandle, devtools, version: info.Browser };
  } catch (error) {
    if (processHandle.exitCode === null && processHandle.signalCode === null) {
      processHandle.kill("SIGTERM");
    }
    throw error;
  }
}

async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await browser.devtools.send("Browser.close", {}, undefined, 3000);
  } catch {
    // Browser.close normally closes the WebSocket before its reply arrives.
  }
  browser.devtools.close();
  for (let i = 0; i < 40 && browser.processHandle.exitCode === null && browser.processHandle.signalCode === null; i++) {
    await sleep(100);
  }
  if (browser.processHandle.exitCode === null && browser.processHandle.signalCode === null) browser.processHandle.kill("SIGTERM");
  for (let i = 0; i < 20 && browser.processHandle.exitCode === null && browser.processHandle.signalCode === null; i++) {
    await sleep(100);
  }
  if (browser.processHandle.exitCode === null && browser.processHandle.signalCode === null) browser.processHandle.kill("SIGKILL");
}

const PAGE_STATE = `(() => {
  const result = document.getElementById('iframe-result');
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    iframeResult: result?.innerText ?? null,
    iframeState: result?.dataset.state ?? result?.dataset.status ?? null,
    iframeUrl: document.querySelector('iframe')?.src ?? null,
    body: document.body?.innerText?.slice(0, 4000) ?? '',
  };
})()`;

async function readPageState(devtools, sessionId) {
  const response = await devtools.send(
    "Runtime.evaluate",
    { expression: PAGE_STATE, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "Page evaluation failed");
  }
  return response.result?.value ?? null;
}

async function waitForPageResult(devtools, sessionId, waitMs) {
  const deadline = Date.now() + waitMs;
  let state = null;
  while (Date.now() < deadline) {
    try {
      state = await readPageState(devtools, sessionId);
      if (state?.readyState === "complete" && state.iframeResult) {
        try {
          const result = JSON.parse(state.iframeResult);
          // The frame sends interim null results while registration or refresh
          // is in flight. It retries 12 times before reporting an absent ID.
          if (result.dbsc || result.error || result.attempts >= 12) return state;
        } catch {
          // The placeholder is plain text until the first probe response.
        }
      }
    } catch {
      // Navigation may still be replacing the document.
    }
    await sleep(300);
  }
  return state;
}

async function visit(browser, host, options, priorEventCount) {
  const { devtools } = browser;
  const { targetId } = await devtools.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await devtools.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  try {
    await devtools.send("Page.enable", {}, sessionId);
    await devtools.send("Runtime.enable", {}, sessionId);
    const url = `https://${host}.localhost:${options.port}/`;
    const navigation = await devtools.send("Page.navigate", { url }, sessionId);
    if (navigation.errorText) throw new Error(`${url}: ${navigation.errorText}`);
    const page = await waitForPageResult(devtools, sessionId, options.waitMs);
    await sleep(1200);
    const allEvents = await getEvents(options.port, options.caBytes);
    return {
      host: `${host}.localhost`,
      page,
      events: allEvents.slice(priorEventCount),
      eventCount: allEvents.length,
    };
  } finally {
    await devtools.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

async function verifyOne(kind, options) {
  const profile = mkdtempSync(join(tmpdir(), `dbsc-verify-${kind}-`));
  let browser = null;
  const result = { browser: kind, profile: options.keepProfiles ? profile : undefined, phases: [] };
  try {
    let eventCount = (await getEvents(options.port, options.caBytes)).length;
    console.error(`Starting ${kind} in an isolated profile`);
    browser = await launchBrowser(kind, profile, options);
    result.version = browser.version;

    for (const host of ["a", "b"]) {
      console.error(`Visiting ${host}.localhost in ${kind}`);
      const phase = await visit(browser, host, options, eventCount);
      result.phases.push(phase);
      eventCount = phase.eventCount;
    }

    if (options.restart) {
      console.error(`Restarting ${kind} with the same profile`);
      await closeBrowser(browser);
      browser = await launchBrowser(kind, profile, options);
    }

    console.error(`Visiting c.localhost in ${kind}`);
    const phase = await visit(browser, "c", options, eventCount);
    result.phases.push(phase);
    return result;
  } finally {
    await closeBrowser(browser);
    if (kind === "chrome") {
      try {
        const preferences = JSON.parse(readFileSync(join(profile, "Default", "Preferences"), "utf8"));
        result.cookieControlsMode = preferences.profile?.cookie_controls_mode ?? null;
      } catch {
        result.cookieControlsMode = null;
      }
    }
    if (!options.keepProfiles) rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const caPath = findCaPath(options.ca);
  options.caBytes = readFileSync(caPath);
  options.spkiFingerprint = spkiFingerprint(options.cert);
  // Fail early if the local HTTPS server or debug endpoint is unavailable.
  await getEvents(options.port, options.caBytes);

  const browsers = options.browser === "both" ? ["brave", "chrome"] : [options.browser];
  const results = [];
  for (const kind of browsers) {
    try {
      results.push(await verifyOne(kind, options));
    } catch (error) {
      results.push({ browser: kind, error: error.message });
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((result) => result.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
