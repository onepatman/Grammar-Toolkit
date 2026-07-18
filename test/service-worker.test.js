// Regression coverage for the "app doesn't reflect the latest deploy"
// class of bug: GitHub Pages deploying successfully is not the same as
// an already-open tab/installed PWA actually showing the new content.
// This file guards the specific mechanics that make an update actually
// reach a device — see service-worker.js for the full reasoning.
//
// service-worker.js is a plain browser script (self.addEventListener,
// no module.exports — it can't run outside a real ServiceWorkerGlobalScope),
// so these are structural/source-level checks rather than a full SW
// runtime simulation, same spirit as testing a shell script's flags
// without actually invoking it.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SW_SOURCE = fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8");
const INDEX_SOURCE = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

describe("service-worker.js cache-busting", () => {
  it("the network-first fetch handler bypasses the browser's own HTTP cache", () => {
    // Without {cache:"no-store"}, fetch(event.request) can silently be
    // satisfied from the browser's disk cache (per whatever
    // Cache-Control the host sent) instead of a real network
    // round-trip — "network-first" in name only.
    const fetchHandlerMatch = SW_SOURCE.match(/self\.addEventListener\("fetch",[\s\S]*?\}\);/);
    expect(fetchHandlerMatch).toBeTruthy();
    expect(fetchHandlerMatch[0]).toContain('fetch(event.request, { cache: "no-store" })');
  });

  it("the install-time precache also bypasses the HTTP cache for each file", () => {
    const installHandlerMatch = SW_SOURCE.match(/self\.addEventListener\("install",[\s\S]*?\}\);/);
    expect(installHandlerMatch).toBeTruthy();
    expect(installHandlerMatch[0]).toContain('{ cache: "reload" }');
  });

  it("activate still purges every cache bucket except the current one", () => {
    const activateHandlerMatch = SW_SOURCE.match(/self\.addEventListener\("activate",[\s\S]*?\}\);/);
    expect(activateHandlerMatch).toBeTruthy();
    expect(activateHandlerMatch[0]).toContain("caches.delete");
    expect(activateHandlerMatch[0]).toContain("key !== CACHE_NAME");
  });

  it("install still calls skipWaiting and activate still calls clients.claim, so a new worker takes over immediately", () => {
    expect(SW_SOURCE).toContain("self.skipWaiting()");
    expect(SW_SOURCE).toContain("self.clients.claim()");
  });
});

describe("index.html service worker registration", () => {
  it("calls registration.update() right after registering, instead of waiting for the browser's own periodic check", () => {
    expect(INDEX_SOURCE).toContain("registration.update()");
  });

  it("reloads the page once a new worker takes control, but only when an old worker already existed", () => {
    expect(INDEX_SOURCE).toContain('addEventListener("controllerchange"');
    expect(INDEX_SOURCE).toContain("hadExistingController");
  });
});
