// A real-semantics fake of the Firebase compat SDK (the same
// `firebase.auth()` / `firebase.firestore()` surface index.html uses),
// enforcing the SAME read/write rules as firestore.rules — not just
// mocked promises. Same philosophy as fake-indexeddb elsewhere in this
// suite: a fake that actually behaves like the real backend's access
// control, so these tests prove the client handles both the success
// AND the permission-denied paths correctly.
//
// This does NOT talk to a real Firebase project — there's no way to do
// that from this sandbox, and there's no need to: the whole point of
// firestore.rules is that the same allow/deny logic is expressed there
// AND mirrored here, so a passing test here is a real claim about how
// the client behaves against that logic, even though the actual
// deployed rules can only be verified by the project owner in their own
// Firebase project (see firestore.rules for that verification step).

export function createFakeFirebase(options = {}) {
  const ownerEmail = options.ownerEmail || "owner@example.com";
  const users = options.users || { [ownerEmail]: "correct-password" };

  const docs = new Map(); // "collection/id" -> data object
  const listeners = new Map(); // path -> Set<{onNext, onError}>
  const authStateListeners = new Set();
  let currentUser = null;
  let uidCounter = 0;

  function setCurrentUser(user) {
    currentUser = user;
    authStateListeners.forEach((fn) => fn(currentUser));
  }

  // Simulates the real SDK's async persisted-session restore: a
  // previously-signed-in user (real owner or anonymous) does NOT show up
  // in .currentUser synchronously right after initializeApp() — it's
  // only available a tick later, once IndexedDB has actually been read.
  // This exact timing gap is what broke the real app (code that read
  // .currentUser synchronously always saw null and signed in
  // anonymously, permanently overwriting the real session before it
  // came back) — options.persistedUser lets a test reproduce that gap
  // on purpose instead of the fake always resolving instantly.
  if (options.persistedUser) {
    Promise.resolve().then(() => setCurrentUser(options.persistedUser));
  }

  function permissionDenied() {
    const e = new Error("Missing or insufficient permissions.");
    e.code = "permission-denied";
    return e;
  }

  function canRead() {
    return !!currentUser;
  }

  // Deliberately does NOT check `.emailVerified` — a real Firebase
  // Console "Add user" account isn't marked verified by default, so
  // this fake models that (see signInWithEmailAndPassword below, which
  // sets emailVerified: false) to make sure the client under test never
  // comes to depend on that flag being true.
  function canWrite() {
    return !!(
      currentUser &&
      !currentUser.isAnonymous &&
      currentUser.email === ownerEmail
    );
  }

  function notify(path) {
    const set = listeners.get(path);
    if (!set) return;
    const data = docs.get(path);
    set.forEach(({ onNext }) => onNext({ exists: data !== undefined, data: () => data }));
  }

  function docRef(path) {
    return {
      get() {
        if (!canRead()) return Promise.reject(permissionDenied());
        const data = docs.get(path);
        return Promise.resolve({ exists: data !== undefined, data: () => data });
      },
      set(data) {
        if (!canWrite()) return Promise.reject(permissionDenied());
        docs.set(path, data);
        notify(path);
        return Promise.resolve();
      },
      onSnapshot(onNext, onError) {
        if (!canRead()) {
          if (onError) onError(permissionDenied());
          return () => {};
        }
        if (!listeners.has(path)) listeners.set(path, new Set());
        const entry = { onNext, onError };
        listeners.get(path).add(entry);
        const data = docs.get(path);
        onNext({ exists: data !== undefined, data: () => data });
        return () => listeners.get(path).delete(entry);
      }
    };
  }

  const auth = {
    get currentUser() {
      return currentUser;
    },
    // Fires once, asynchronously (matching the real SDK — never
    // synchronously), with whatever the current user is at that moment;
    // then again on every later change. Returns an unsubscribe function.
    onAuthStateChanged(callback) {
      authStateListeners.add(callback);
      Promise.resolve().then(() => {
        if (authStateListeners.has(callback)) callback(currentUser);
      });
      return () => authStateListeners.delete(callback);
    },
    signInAnonymously() {
      setCurrentUser({ uid: "anon-" + ++uidCounter, isAnonymous: true, email: null, emailVerified: false });
      return Promise.resolve({ user: currentUser });
    },
    signInWithEmailAndPassword(email, password) {
      if (!Object.prototype.hasOwnProperty.call(users, email)) {
        const e = new Error("There is no user record corresponding to this identifier.");
        e.code = "auth/user-not-found";
        return Promise.reject(e);
      }
      if (users[email] !== password) {
        const e = new Error("The password is invalid.");
        e.code = "auth/wrong-password";
        return Promise.reject(e);
      }
      // emailVerified: false on purpose — matches a real Console-created
      // account, which is never pre-verified. See canWrite() above.
      setCurrentUser({ uid: "user-" + email, isAnonymous: false, email, emailVerified: false });
      return Promise.resolve({ user: currentUser });
    },
    signOut() {
      setCurrentUser(null);
      return Promise.resolve();
    }
  };

  const apps = [];
  const firestoreFn = () => ({
    collection(name) {
      return {
        doc(id) {
          return docRef(name + "/" + id);
        }
      };
    }
  });
  firestoreFn.FieldValue = { serverTimestamp: () => "SERVER_TIMESTAMP" };

  return {
    apps,
    initializeApp() {
      apps.push({});
    },
    // Matches the REAL Firebase SDK: calling firebase.auth() before
    // firebase.initializeApp() has run throws "No Firebase App
    // '[DEFAULT]' has been created". This bit us for real — index.html
    // used to call firebase.auth() unconditionally at page-init time,
    // which crashed on every real page load (before any sync action had
    // triggered initFirebaseIfConfigured()) and silently broke every
    // click handler defined later in the script. The fake originally
    // never threw here regardless of init state, so no test caught it.
    auth: () => {
      if (!apps.length) {
        const e = new Error("Firebase: No Firebase App '[DEFAULT]' has been created - call firebase.initializeApp() (app/no-app).");
        e.code = "app/no-app";
        throw e;
      }
      return auth;
    },
    firestore: firestoreFn,
    // Test-only escape hatches, not part of the real Firebase SDK surface.
    _ownerEmail: ownerEmail,
    _docs: docs
  };
}
