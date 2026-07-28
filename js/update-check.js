/* =========================================================
   Update check — compares the running app's version against this
   repo's latest GitHub Release, so the app can offer to update itself
   like a modern desktop/mobile app instead of the user having to know
   to hard-refresh.

   Loaded as a plain browser <script> (attaches window.UpdateCheck) and
   as a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both, mirroring every other
   js/*.js module in this app.

   Design notes (why it's shaped this way):
   - checkForUpdate() never throws — offline, a rate-limited GitHub API
     response, a repo with no releases yet, or a malformed response all
     resolve to {hasUpdate: false}, never an error the caller has to
     handle specially. A failed update check should be invisible to the
     user, not a broken popup.
   - This app's service worker (service-worker.js) already fetches
     network-first and calls skipWaiting()/clients.claim()
     unconditionally on install — there's no "waiting worker" to
     activate. The genuinely honest "Update Now" action for THIS app is
     therefore: ask the registration to check for a new worker script,
     then reload — the network-first fetch strategy does the rest. This
     module deliberately does not pretend to do a native-app-style
     silent binary download/replace, since a browser-only PWA can't
     actually do that.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.UpdateCheck = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  function buildReleasesUrl(owner, repo) {
    return "https://api.github.com/repos/" + owner + "/" + repo + "/releases/latest";
  }

  // Strips an optional leading "v" and splits on "." into numeric
  // segments, e.g. "v2.1.0" -> [2, 1, 0]. Returns null if any segment
  // isn't a plain number, so a non-semver tag never gets silently
  // mis-ordered.
  function parseVersion(tag) {
    var cleaned = String(tag || "").trim().replace(/^v/i, "");
    if (!cleaned) return null;
    var parts = cleaned.split(".").map(function (p) { return parseInt(p, 10); });
    if (parts.some(function (n) { return isNaN(n); })) return null;
    return parts;
  }

  // Returns true only when `latest` is a version genuinely GREATER than
  // `current` — equal or older (including "can't tell, so don't nag")
  // both resolve to false. Never compares by string alone for
  // well-formed semver tags, since "v9.0.0" < "v10.0.0" as strings but
  // isn't numerically.
  function isNewerVersion(current, latest) {
    var a = parseVersion(current);
    var b = parseVersion(latest);
    if (!a || !b) return String(current).trim() !== String(latest).trim() && !!latest;
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) {
      var av = a[i] || 0, bv = b[i] || 0;
      if (bv > av) return true;
      if (bv < av) return false;
    }
    return false;
  }

  // GitHub release bodies are free-form markdown. Pulls out "- " / "* "
  // bulleted lines as the release-notes list this app's popup shows;
  // falls back to non-empty plain lines (capped) if the body has no
  // bullets at all, so a release note written as plain sentences still
  // shows something instead of an empty list. Never invents notes when
  // the release genuinely has none.
  function extractReleaseNotes(body, maxItems) {
    var limit = typeof maxItems === "number" ? maxItems : 6;
    var lines = String(body || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var bullets = lines
      .filter(function (l) { return /^[-*]\s+/.test(l); })
      .map(function (l) { return l.replace(/^[-*]\s+/, "").trim(); })
      .filter(Boolean);
    var source = bullets.length > 0 ? bullets : lines.filter(function (l) { return !/^#+\s/.test(l); });
    return source.slice(0, limit);
  }

  function checkForUpdate(options) {
    var opts = options || {};
    var owner = opts.owner;
    var repo = opts.repo;
    var currentVersion = opts.currentVersion;
    var fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    var notFound = { hasUpdate: false, latestVersion: null, releaseNotes: [], htmlUrl: null };

    if (!owner || !repo || !currentVersion || !fetchImpl) return Promise.resolve(notFound);

    var isOnline = typeof opts.isOnline === "function"
      ? opts.isOnline
      : function () { return typeof navigator === "undefined" || navigator.onLine !== false; };
    if (!isOnline()) return Promise.resolve(notFound);

    return fetchImpl(buildReleasesUrl(owner, repo), { signal: opts.signal })
      .then(function (res) {
        if (!res || !res.ok) return null; // includes 404 (no releases published yet)
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.tag_name) return notFound;
        var hasUpdate = isNewerVersion(currentVersion, json.tag_name);
        if (!hasUpdate) return notFound;
        return {
          hasUpdate: true,
          latestVersion: json.tag_name,
          releaseNotes: extractReleaseNotes(json.body),
          htmlUrl: json.html_url || null
        };
      })
      .catch(function () {
        // Offline, CORS failure, rate-limited, malformed JSON, etc. —
        // all treated the same: no update to report right now.
        return notFound;
      });
  }

  return {
    buildReleasesUrl: buildReleasesUrl,
    parseVersion: parseVersion,
    isNewerVersion: isNewerVersion,
    extractReleaseNotes: extractReleaseNotes,
    checkForUpdate: checkForUpdate
  };
});
