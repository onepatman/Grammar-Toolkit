// Loads the *real* index.html in jsdom and runs its real scripts, so
// data-integrity tests assert against production data/behavior instead
// of a duplicated copy. No build step involved — this just parses and
// executes the file exactly as a browser would.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const INDEX_HTML_PATH = path.join(REPO_ROOT, "index.html");
const APP_ORIGIN = "http://localhost/";

// Serves same-origin script requests (js/correction-log.js etc.) straight
// off disk. Everything else — the Firebase CDN scripts, Google Fonts — is
// resolved to an empty response instead of hitting the network. The app
// already treats a missing/undefined `firebase` global as "sync not
// configured" and degrades gracefully, so this is a faithful stand-in.
class LocalOnlyResourceLoader extends ResourceLoader {
  fetch(url) {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") {
      const filePath = path.join(REPO_ROOT, decodeURIComponent(parsed.pathname));
      return Promise.resolve(fs.readFileSync(filePath));
    }
    return Promise.resolve(Buffer.from(""));
  }
}

// options.indexedDBFactory: pass the SAME IDBFactory instance across two
// loadApp() calls to simulate "close the app, reopen it later" and prove
// data persisted. Defaults to a fresh, isolated factory per call so tests
// never see another test's cached words.
export async function loadApp(options) {
  const opts = options || {};
  const indexedDBFactory = opts.indexedDBFactory || new IDBFactory();
  // Most existing tests exercise admin features (add/edit/delete a
  // correction, import a pack, add a phrasal word) that owner-mode.js
  // now gates behind an unlocked device — default every session to
  // already-unlocked so that behavior keeps working out of the box.
  // Pass `ownerUnlocked: false` to test the locked/read-only state.
  const ownerUnlocked = opts.ownerUnlocked !== false;

  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: new LocalOnlyResourceLoader(),
    url: APP_ORIGIN + "index.html",
    pretendToBeVisual: true,
    beforeParse(window) {
      // Must be set before any inline <script> runs, since the app opens
      // its vocab cache database synchronously during page load.
      window.indexedDB = indexedDBFactory;
      // jsdom's window.crypto has no `.subtle` implementation — owner-mode.js
      // needs real SHA-256 hashing, so back it with Node's own Web Crypto.
      if (!window.crypto.subtle) {
        Object.defineProperty(window.crypto, "subtle", { value: webcrypto.subtle, configurable: true });
      }
      // jsdom doesn't expose TextEncoder/TextDecoder on window either —
      // owner-mode.js needs TextEncoder to turn a PIN into bytes to hash.
      if (!window.TextEncoder) window.TextEncoder = TextEncoder;
      if (!window.TextDecoder) window.TextDecoder = TextDecoder;
      // jsdom has no Web Speech API at all — a minimal stub keeps the
      // Listen button's feature-detection (`"speechSynthesis" in window`)
      // true by default so it's exercised in tests; individual tests can
      // still override/spy on window.speechSynthesis.speak themselves.
      if (!window.speechSynthesis) {
        window.speechSynthesis = { speak: () => {}, cancel: () => {} };
      }
      if (!window.SpeechSynthesisUtterance) {
        window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
          this.text = text;
        };
      }
      if (ownerUnlocked) {
        window.localStorage.setItem("mepf_toolkit_owner_unlocked", "1");
      }
      // Only set when a test explicitly passes one (e.g. via
      // createFakeFirebase()) — leaving `firebase` undefined is what
      // makes every other test's sync code stay a no-op, same as before.
      if (opts.firebase) {
        window.firebase = opts.firebase;
      }
      // Lets a test simulate "this device was already connected/signed
      // in before this load" (e.g. a saved sync code triggering
      // autoReconnectSync on startup) — must be set before any inline
      // <script> runs, same reasoning as everything else in this hook.
      if (opts.localStorage) {
        Object.entries(opts.localStorage).forEach(([key, value]) => {
          window.localStorage.setItem(key, value);
        });
      }
    }
  });

  // jsdom doesn't implement actual scrolling — stub both so app code that
  // scrolls the page into view after a search/navigation doesn't throw.
  dom.window.scrollTo = () => {};
  dom.window.Element.prototype.scrollIntoView = () => {};

  await new Promise((resolve, reject) => {
    dom.window.addEventListener("load", resolve);
    setTimeout(() => reject(new Error("index.html did not finish loading within 5s")), 5000);
  });

  const hooks = dom.window.__TOOLKIT_TEST_HOOKS__;
  if (!hooks) {
    throw new Error("window.__TOOLKIT_TEST_HOOKS__ was not set — did index.html's test-hook block run?");
  }
  // Let the async vocab-cache and Language Bank category restores
  // (kicked off during page load) finish before handing back control,
  // so tests see a fully settled search index without needing their
  // own arbitrary wait.
  await Promise.all([
    hooks.vocabCacheRestorePromise,
    hooks.phrasalCacheRestorePromise,
    hooks.idiomsCacheRestorePromise,
    hooks.sentencesCacheRestorePromise,
    hooks.patternsCacheRestorePromise,
    hooks.technicalCacheRestorePromise
  ]);

  return { dom, window: dom.window, hooks, indexedDBFactory };
}
