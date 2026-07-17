/* =========================================================
   Sync auth — pure helpers for the real, server-enforced half of
   owner-only access: knowing whether a Firebase user object represents
   the signed-in owner, and turning Firebase Auth/Firestore error codes
   into plain-English status messages.

   Loaded as a plain browser <script> (attaches window.SyncAuth) and as
   a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.

   This module has no Firebase dependency itself — it only inspects
   plain objects (a Firebase User, or an Error with a `.code`), which is
   what keeps it unit-testable without mocking the Firebase SDK. See
   js/owner-mode.js for the OTHER (local, client-side-only) half of
   owner gating, and firestore.rules for the actual server-side
   enforcement this module's isOwnerAuthenticated() mirrors.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.SyncAuth = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  // Mirrors firestore.rules' write condition exactly: a real
  // (non-anonymous) sign-in, with a verified email, matching the
  // configured owner email. Anonymous users (every read-only device)
  // always fail this — by design, they have no `.email` at all.
  function isOwnerAuthenticated(user, ownerEmail) {
    return !!(
      user &&
      !user.isAnonymous &&
      user.email &&
      user.emailVerified &&
      (!ownerEmail || user.email === ownerEmail)
    );
  }

  var SIGN_IN_ERROR_MESSAGES = {
    "auth/wrong-password": "Incorrect password.",
    "auth/user-not-found": "No owner account with that email.",
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts — please wait a bit and try again.",
    "auth/network-request-failed": "No internet connection.",
    "auth/user-disabled": "This account has been disabled."
  };

  function friendlySignInError(error) {
    var code = error && error.code;
    if (code && SIGN_IN_ERROR_MESSAGES[code]) return SIGN_IN_ERROR_MESSAGES[code];
    return "Couldn't sign in: " + (error && error.message ? error.message : "unknown error");
  }

  function friendlyWriteError(error) {
    var code = error && error.code;
    if (code === "permission-denied") {
      return "Only the signed-in owner can save changes to the shared log. Your change was saved on this device, but not to the shared log.";
    }
    return "Couldn't save to the shared log: " + (error && error.message ? error.message : "unknown error");
  }

  return {
    isOwnerAuthenticated: isOwnerAuthenticated,
    friendlySignInError: friendlySignInError,
    friendlyWriteError: friendlyWriteError
  };
});
