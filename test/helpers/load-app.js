// Loads the *real* index.html in jsdom and runs its real scripts, so
// data-integrity tests assert against production data/behavior instead
// of a duplicated copy. No build step involved — this just parses and
// executes the file exactly as a browser would.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import { IDBFactory } from "fake-indexeddb";

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
  // Let the async vocab-cache restore (kicked off during page load)
  // finish before handing back control, so tests see a fully settled
  // search index without needing their own arbitrary wait.
  await hooks.vocabCacheRestorePromise;

  return { dom, window: dom.window, hooks, indexedDBFactory };
}
