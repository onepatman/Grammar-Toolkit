/* =========================================================
   AI Judge — an optional, Owner-supplied-key layer on top of the
   Journal tab's grammar grading (js/grammar-check.js). LanguageTool
   catches grammar/spelling/style RULES; this asks an LLM (Anthropic's
   Claude, called directly from the browser) to judge something a
   rule-checker can't: does the writing actually read naturally and
   clearly to a human, independent of whether it's technically correct.

   Why a user-supplied key, called straight from the browser: this app
   has no backend of its own (static files only — see service-worker.js/
   README), so there is nowhere safe to hold a shared secret API key —
   anything baked into this file would be sitting in plain view of
   anyone who opens dev tools. Instead each Owner enters their OWN
   Anthropic key (see the "AI Smoothness Judge" box in the Fixes tab),
   stored ONLY in this browser's localStorage — never part of any
   Firestore sync payload (see index.html's collectJournalForSync /
   pushToSync, which never touch API_KEY_STORAGE_KEY) — and every call
   this module makes bills that Owner's own account, the same way it
   would if they'd typed the key into any other Claude client.

   Loaded as a plain browser <script> (attaches window.AIJudge) and as
   a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.

   Design notes (same "never breaks the caller" contract as
   js/grammar-check.js / js/online-lookup.js):
   - judgeSmoothness() always resolves, never rejects — no key, offline,
     a network failure, or a malformed model response all just resolve
     to {ok:false, reason}, so callers never need a catch.
   - opts.apiKey / opts.fetchImpl / opts.signal / opts.isOnline are
     injectable for testability, the same seam GrammarCheck uses.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.AIJudge = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var API_URL = "https://api.anthropic.com/v1/messages";
  var ANTHROPIC_VERSION = "2023-06-01";
  var API_KEY_STORAGE_KEY = "mepf_toolkit_claude_api_key";
  var DEFAULT_MODEL = "claude-haiku-4-5-20251001";

  // Deliberately does NOT ask the model to repeat grammar/spelling
  // fixes — js/grammar-check.js's LanguageTool call already owns that
  // job. This prompt's entire job is the thing a rule-based checker
  // structurally can't do: judge whether the writing actually reads
  // naturally and clearly to a human.
  var SYSTEM_PROMPT = "You are an English writing coach for a non-native speaker practicing in a personal journal. " +
    "Judge ONLY how natural, clear, and understandable the writing sounds (smoothness, flow, coherence) — " +
    "assume grammar and spelling have already been checked separately, so do NOT flag grammar or spelling mistakes here. " +
    "Reply with ONLY a JSON object, no other text before or after it, in exactly this shape: " +
    "{\"score\": <number 0-10, one decimal place>, \"summary\": \"<one short sentence overall verdict>\", " +
    "\"notes\": [\"<a specific awkward or unclear part, plus a smoother way to say it>\", ... up to 4 notes]}. " +
    "If the writing already reads naturally, give a high score and an empty notes array.";

  function getStorage(storage) {
    return storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  function getApiKey(storage) {
    var store = getStorage(storage);
    if (!store) return "";
    try {
      return store.getItem(API_KEY_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setApiKey(key, storage) {
    var store = getStorage(storage);
    if (!store) return false;
    try {
      var trimmed = String(key || "").trim();
      if (trimmed) store.setItem(API_KEY_STORAGE_KEY, trimmed);
      else store.removeItem(API_KEY_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearApiKey(storage) {
    return setApiKey("", storage);
  }

  function hasApiKey(storage) {
    return !!getApiKey(storage);
  }

  function buildRequestBody(text, model) {
    return JSON.stringify({
      model: model,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }]
    });
  }

  // The model is instructed to reply with ONLY JSON, but this pulls
  // out the first {...} block regardless — cheap insurance against an
  // occasional stray sentence wrapped around it.
  function extractJson(rawText) {
    if (!rawText) return null;
    var match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      return null;
    }
  }

  function normalizeResponse(json) {
    var blocks = json && Array.isArray(json.content) ? json.content : [];
    var textBlock = null;
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === "text") { textBlock = blocks[i]; break; }
    }
    var parsed = textBlock ? extractJson(textBlock.text) : null;
    if (!parsed || typeof parsed.score !== "number" || isNaN(parsed.score)) {
      return { ok: false, reason: "parse-error" };
    }
    var score = Math.max(0, Math.min(10, parsed.score));
    return {
      ok: true,
      score: Math.round(score * 10) / 10,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter(function (n) { return typeof n === "string" && n.trim(); })
        : []
    };
  }

  // Resolves to one of:
  //   {ok:true, score, summary, notes}
  //   {ok:false, reason: "empty" | "no-api-key" | "offline" | "no-fetch" |
  //     "invalid-key" | "http-error" | "parse-error" | "network-error"}
  function judgeSmoothness(text, options) {
    var opts = options || {};
    var trimmed = String(text || "").trim();
    if (!trimmed) return Promise.resolve({ ok: false, reason: "empty" });

    var apiKey = opts.apiKey || getApiKey(opts.storage);
    if (!apiKey) return Promise.resolve({ ok: false, reason: "no-api-key" });

    var isOnline = typeof opts.isOnline === "boolean"
      ? opts.isOnline
      : (typeof navigator === "undefined" || navigator.onLine !== false);
    if (!isOnline) return Promise.resolve({ ok: false, reason: "offline" });

    var fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return Promise.resolve({ ok: false, reason: "no-fetch" });

    var model = opts.model || DEFAULT_MODEL;

    return fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // Anthropic's API requires this explicit opt-in before it will
        // answer a browser-origin request at all (see
        // https://docs.anthropic.com — "Direct browser access") —
        // without it, a same request from fetch() fails outright.
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: buildRequestBody(trimmed, model),
      signal: opts.signal
    }).then(function (res) {
      if (!res) return null;
      return res.json().then(function (json) {
        return { httpOk: res.ok, json: json };
      }, function () {
        return { httpOk: res.ok, json: null };
      });
    }).then(function (result) {
      if (!result) return { ok: false, reason: "http-error" };
      if (!result.httpOk) {
        var apiErrType = result.json && result.json.error && result.json.error.type;
        if (apiErrType === "authentication_error" || apiErrType === "permission_error") {
          return { ok: false, reason: "invalid-key" };
        }
        return { ok: false, reason: "http-error" };
      }
      return result.json ? normalizeResponse(result.json) : { ok: false, reason: "parse-error" };
    }).catch(function () {
      return { ok: false, reason: "network-error" };
    });
  }

  return {
    API_URL: API_URL,
    API_KEY_STORAGE_KEY: API_KEY_STORAGE_KEY,
    DEFAULT_MODEL: DEFAULT_MODEL,
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    clearApiKey: clearApiKey,
    hasApiKey: hasApiKey,
    normalizeResponse: normalizeResponse,
    judgeSmoothness: judgeSmoothness
  };
});
