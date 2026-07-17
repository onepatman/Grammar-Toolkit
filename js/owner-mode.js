/* =========================================================
   Owner mode — a PIN-gated deterrent that hides the toolkit's
   administrative controls (add/edit/delete corrections, connect sync,
   import an offline pack, add a phrasal word) from anyone who doesn't
   know the owner's PIN.

   Loaded as a plain browser <script> (attaches window.OwnerMode) and as
   a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.

   IMPORTANT — what this actually is and isn't:
   This app has no backend server, so there is no way to verify a PIN
   against anything but this same browser's own localStorage. That
   makes this a client-side UI gate, not real access control: anyone
   comfortable with browser dev tools can bypass it (e.g. by calling
   OwnerMode.setOwnerPin from the console, or editing localStorage
   directly) or by editing the corrections directly in the synced
   Firestore database if they know the sync code. Genuine enforcement
   of "only the owner can write" for the shared, synced correction log
   would require server-side Firestore Security Rules plus real
   (non-anonymous) authentication — outside what a static, no-build
   client file can provide on its own.

   What this DOES achieve: it stops casual/accidental use of admin
   features by anyone who opens the app without knowing the PIN, on
   every device that hasn't had that PIN entered — which is the
   practical goal for a shared personal/team reference tool like this.

   The PIN itself is per-device: the owner sets it once on each of
   their own devices (same PIN every time), and it stays unlocked on
   that device until explicitly locked. A device that has never had the
   correct PIN entered stays read-only indefinitely.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.OwnerMode = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var PIN_HASH_KEY = "mepf_toolkit_owner_pin_hash";
  var UNLOCKED_KEY = "mepf_toolkit_owner_unlocked";
  var MIN_PIN_LENGTH = 4;

  function getStorage(options) {
    var opts = options || {};
    if (opts.storage) return opts.storage;
    if (typeof localStorage !== "undefined") return localStorage;
    return null;
  }

  function getSubtle(options) {
    var opts = options || {};
    if (opts.subtleCrypto) return opts.subtleCrypto;
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) return window.crypto.subtle;
    if (typeof crypto !== "undefined" && crypto.subtle) return crypto.subtle;
    return null;
  }

  function bytesToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function hashPin(pin, options) {
    var subtle = getSubtle(options);
    if (!subtle) return Promise.resolve(null);
    var bytes = new TextEncoder().encode(String(pin));
    return subtle.digest("SHA-256", bytes).then(bytesToHex).catch(function () { return null; });
  }

  function hasOwnerPinSet(options) {
    var storage = getStorage(options);
    if (!storage) return false;
    return !!storage.getItem(PIN_HASH_KEY);
  }

  // Only meaningful as a bootstrap ("claim this device as the owner
  // device") or, once unlocked, as a way to change the PIN — callers in
  // the UI should require the device to already be unlocked before
  // allowing a PIN change on an already-claimed device.
  function setOwnerPin(pin, options) {
    var trimmed = String(pin || "").trim();
    if (trimmed.length < MIN_PIN_LENGTH) return Promise.resolve(false);
    var storage = getStorage(options);
    if (!storage) return Promise.resolve(false);
    return hashPin(trimmed, options).then(function (hash) {
      if (!hash) return false;
      storage.setItem(PIN_HASH_KEY, hash);
      storage.setItem(UNLOCKED_KEY, "1");
      return true;
    });
  }

  function unlockOwnerMode(pin, options) {
    var storage = getStorage(options);
    if (!storage) return Promise.resolve(false);
    var storedHash = storage.getItem(PIN_HASH_KEY);
    if (!storedHash) return Promise.resolve(false);
    return hashPin(String(pin || "").trim(), options).then(function (hash) {
      if (hash && hash === storedHash) {
        storage.setItem(UNLOCKED_KEY, "1");
        return true;
      }
      return false;
    });
  }

  function lockOwnerMode(options) {
    var storage = getStorage(options);
    if (!storage) return;
    storage.removeItem(UNLOCKED_KEY);
  }

  function isOwnerModeUnlocked(options) {
    var storage = getStorage(options);
    if (!storage) return false;
    return storage.getItem(UNLOCKED_KEY) === "1";
  }

  // Forgot-PIN recovery: since there's no server to reset a PIN through,
  // the only way back into a locked-out device is to clear it locally
  // and set a new one — same trust model as forgetting a Wi-Fi password
  // you set yourself.
  function resetOwnerPin(options) {
    var storage = getStorage(options);
    if (!storage) return;
    storage.removeItem(PIN_HASH_KEY);
    storage.removeItem(UNLOCKED_KEY);
  }

  return {
    MIN_PIN_LENGTH: MIN_PIN_LENGTH,
    hasOwnerPinSet: hasOwnerPinSet,
    setOwnerPin: setOwnerPin,
    unlockOwnerMode: unlockOwnerMode,
    lockOwnerMode: lockOwnerMode,
    isOwnerModeUnlocked: isOwnerModeUnlocked,
    resetOwnerPin: resetOwnerPin
  };
});
