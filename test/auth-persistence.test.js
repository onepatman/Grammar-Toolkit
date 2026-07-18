// Regression coverage for: "every time I refresh/reopen the app, my
// Owner session is lost." Firebase's persisted sign-in is restored
// ASYNCHRONOUSLY (it reads IndexedDB) — code that read
// firebase.auth().currentUser synchronously right after init almost
// always saw null even when a real session was about to come back a
// moment later, and would sign in anonymously, permanently overwriting
// the real owner session before it had a chance to restore. This is
// why "sign in as owner" never survived a page refresh or PWA relaunch.
//
// createFakeFirebase's `persistedUser` option reproduces that exact
// timing gap on purpose (see test/helpers/fake-firebase.js) — currentUser
// starts null and only resolves to the persisted user a tick later,
// matching the real SDK closely enough to actually catch this class of
// bug, unlike a fake that resolves everything synchronously/instantly.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "correct-horse-battery-staple";
const SYNC_CODE_KEY = "mepf_toolkit_sync_code";

function ownerUser() {
  return { uid: "user-" + OWNER_EMAIL, isAnonymous: false, email: OWNER_EMAIL, emailVerified: false };
}

describe("waitForInitialAuthState()", () => {
  it("resolves to the persisted user once Firebase's async restore completes, not prematurely to null", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    const { hooks } = await loadApp({ firebase });
    hooks.initFirebaseIfConfigured(); // real callers always do this first — see connectSync/autoReconnectSync

    // By the time loadApp()'s own internal awaits settle, the fake's
    // persistedUser microtask has typically already resolved too — the
    // real bug wasn't "currentUser is asynchronous" in the abstract, it
    // was code that read it SYNCHRONOUSLY right after init without ever
    // waiting at all. waitForInitialAuthState() is what actually matters
    // here: it must resolve to the persisted user, not null.
    const user = await hooks.waitForInitialAuthState();
    expect(user).toEqual(ownerUser());
  });

  it("resolves to null when nobody was ever signed in — the legitimate 'not the owner' case still works", async () => {
    const firebase = createFakeFirebase({ ownerEmail: OWNER_EMAIL, users: { [OWNER_EMAIL]: OWNER_PASSWORD } });
    const { hooks } = await loadApp({ firebase });
    hooks.initFirebaseIfConfigured();

    const user = await hooks.waitForInitialAuthState();
    expect(user).toBeNull();
  });
});

describe("autoReconnectSync — the owner's session survives a simulated page reload/PWA relaunch", () => {
  it("does NOT overwrite a persisted owner session with a fresh anonymous one", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    const { hooks } = await loadApp({
      firebase,
      localStorage: { [SYNC_CODE_KEY]: "family-code" }
    });
    await wait(30);

    expect(firebase.auth().currentUser).toEqual(ownerUser());
    expect(hooks.isDeviceUnlocked()).toBe(true);
  });

  it("reveals admin controls (correction log, Language Bank quick-add) automatically, with no further clicks needed", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    const { window } = await loadApp({
      firebase,
      ownerUnlocked: false, // no local PIN — the restored Firebase session is the ONLY thing unlocking this device
      localStorage: { [SYNC_CODE_KEY]: "family-code" }
    });
    await wait(30);

    const document = window.document;
    expect(document.getElementById("correctionAddBox").style.display).not.toBe("none");
    expect(document.getElementById("phrasalAddBox").style.display).not.toBe("none");
  });

  it("shows Edit/Delete on an owner-added Language Bank entry automatically after the restore", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    const { window, hooks } = await loadApp({
      firebase,
      ownerUnlocked: false,
      localStorage: { [SYNC_CODE_KEY]: "family-code" }
    });
    await wait(30);

    const sample = {
      w: "test the waters", senses: [{ use: "(idiom) Try something cautiously.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    };
    hooks.addIdiomEntry(sample, { persist: false });
    const document = window.document;
    document.getElementById("idiomsSelect").value = sample.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeTruthy();
    expect(document.getElementById("idiomsEntry").querySelector(".lb-delete-btn")).toBeTruthy();
  });

  it("still falls back to anonymous sign-in when nobody was ever signed in before (the ordinary viewer case)", async () => {
    const firebase = createFakeFirebase({ ownerEmail: OWNER_EMAIL, users: { [OWNER_EMAIL]: OWNER_PASSWORD } });
    const { hooks } = await loadApp({
      firebase,
      ownerUnlocked: false, // isolates Firebase-restored auth from the separate local-PIN unlock path
      localStorage: { [SYNC_CODE_KEY]: "family-code" }
    });
    await wait(30);

    expect(firebase.auth().currentUser.isAnonymous).toBe(true);
    expect(hooks.isDeviceUnlocked()).toBe(false);
  });

  it("connects to the shared log using the restored owner session, not a fresh anonymous one", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    firebase._docs.set("syncedLogs/family-code", { entries: [], languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [] } });
    const { window, hooks } = await loadApp({
      firebase,
      ownerUnlocked: false,
      localStorage: { [SYNC_CODE_KEY]: "family-code" }
    });
    await wait(30);

    // Proves the restored owner session is the one actually connected —
    // a correction added now should reach the shared doc, which only
    // succeeds for the real, non-anonymous owner (see firestore.rules).
    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(30);

    expect(firebase._docs.get("syncedLogs/family-code").entries.some((e) => e.wrong === "He go")).toBe(true);
  });
});

describe("connectSync — respects a persisted session instead of racing to sign in anonymously", () => {
  it("uses the restored owner session when Connect is clicked shortly after load", async () => {
    const firebase = createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD },
      persistedUser: ownerUser()
    });
    const { hooks } = await loadApp({ firebase });

    // No wait() here on purpose — connectSync is called as early as
    // possible, inside the same race window that used to break this.
    await hooks.connectSync("narrow-window-code");

    expect(firebase.auth().currentUser).toEqual(ownerUser());
    expect(firebase._docs.has("syncedLogs/narrow-window-code")).toBe(true);
  });
});
