// Integration tests for owner-authenticated sync — the REAL,
// server-enforced half of owner-only access (js/sync-auth.js +
// firestore.rules), as opposed to the local-only PIN in
// js/owner-mode.js covered by test/owner-mode*.test.js.
//
// Uses createFakeFirebase() (test/helpers/fake-firebase.js), which
// enforces the SAME read/write rules firestore.rules describes — not
// mocked promises — so a passing test here is a real claim about how
// the client behaves against that access-control logic.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "correct-horse-battery-staple";

function makeFirebase() {
  return createFakeFirebase({
    ownerEmail: OWNER_EMAIL,
    users: { [OWNER_EMAIL]: OWNER_PASSWORD }
  });
}

describe("connecting without owner sign-in (anonymous, read-only)", () => {
  it("connects successfully but does not create the shared doc", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.connectSync("team-code-1");

    expect(firebase._docs.has("syncedLogs/team-code-1")).toBe(false);
  });

  it("watches whatever the owner already seeded, read-only", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/team-code-2", {
      entries: [{ id: "pc_1", wrong: "He go", right: "He goes", why: "" }]
    });

    const { hooks } = await loadApp({ firebase });
    await hooks.connectSync("team-code-2");
    await wait();

    expect(hooks.loadPersonalCorrections()).toEqual([
      { id: "pc_1", wrong: "He go", right: "He goes", why: "" }
    ]);
  });

  it("does NOT clear local corrections just because the shared doc doesn't exist yet", async () => {
    // Regression test: connecting (or signing in) used to always run
    // savePersonalCorrections(doc.exists ? doc.data().entries : [])
    // unconditionally, which wiped out anything already on the device
    // the moment you connected to a brand-new/unseeded code.
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    hooks.savePersonalCorrections([{ id: "pc_local", wrong: "He go", right: "He goes", why: "" }]);

    await hooks.connectSync("brand-new-code");
    await wait();

    expect(hooks.loadPersonalCorrections()).toEqual([
      { id: "pc_local", wrong: "He go", right: "He goes", why: "" }
    ]);
  });

  it("the Connect button works without unlocking the local owner PIN — viewers don't need it", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/public-code", {
      entries: [{ id: "pc_1", wrong: "He go", right: "He goes", why: "" }]
    });

    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    expect(document.getElementById("syncConnectBtn")).toBeTruthy();
    document.getElementById("syncCodeInput").value = "public-code";
    document.getElementById("syncConnectBtn").click();
    await wait(50);

    expect(document.getElementById("syncStatus").textContent).toContain("Connected");
    expect(window.__TOOLKIT_TEST_HOOKS__.loadPersonalCorrections()).toEqual([
      { id: "pc_1", wrong: "He go", right: "He goes", why: "" }
    ]);
  });
});

describe("signing in as owner", () => {
  it("succeeds with the correct email and password", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);

    expect(firebase.auth().currentUser.email).toBe(OWNER_EMAIL);
    expect(window.SyncAuth.isOwnerAuthenticated(firebase.auth().currentUser)).toBe(true);
    const document = window.document;
    expect(document.getElementById("syncOwnerAuthStatus").textContent).toContain("Signed in as");
    expect(document.getElementById("syncSignedInPanel").style.display).not.toBe("none");
  });

  it("fails with a friendly message on the wrong password", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, "not-the-password");

    expect(firebase.auth().currentUser).toBeNull();
    const document = window.document;
    expect(document.getElementById("syncOwnerAuthStatus").textContent).toBe("Incorrect password.");
    expect(document.getElementById("syncSignInForm").style.display).not.toBe("none");
  });

  it("fails with a friendly message for an unknown email", async () => {
    const firebase = makeFirebase();
    const { hooks, window } = await loadApp({ firebase });

    await hooks.signInAsOwner("nobody@example.com", "whatever");

    expect(window.document.getElementById("syncOwnerAuthStatus").textContent).toContain("No owner account");
  });

  it("works via the actual sign-in button EVEN when the device is locally locked — that's how a fresh device gets unlocked", async () => {
    const firebase = makeFirebase();
    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    document.getElementById("syncOwnerEmailInput").value = OWNER_EMAIL;
    document.getElementById("syncOwnerPasswordInput").value = OWNER_PASSWORD;
    document.getElementById("syncSignInBtn").click();
    await wait();

    expect(firebase.auth().currentUser.email).toBe(OWNER_EMAIL);
  });
});

describe("the owner's writes reach the shared log", () => {
  it("seeds the shared doc on first connect once signed in as owner", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("team-code-3");

    expect(firebase._docs.has("syncedLogs/team-code-3")).toBe(true);
  });

  it("a correction the owner adds while connected is saved to the shared doc", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("team-code-4");

    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/team-code-4");
    expect(doc.entries.some((e) => e.wrong === "He go")).toBe(true);
    expect(document.getElementById("qaAddStatus").textContent).toContain("Saved");
  });

  it("regression: a correction added locally BEFORE signing in as owner survives the sign-in and ends up in the shared doc", async () => {
    // This is the exact bug reported: unlock the local PIN, add a
    // correction (no sync connected yet), THEN sign in as owner in the
    // Sync panel — the local addition used to vanish, because signing
    // in re-attached the Firestore listener, which unconditionally
    // wrote `entries: []` over local storage since the shared doc
    // didn't exist yet.
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(50);
    expect(hooks.loadPersonalCorrections()).toHaveLength(1);

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await wait(50);

    expect(hooks.loadPersonalCorrections()).toHaveLength(1);
    expect(hooks.loadPersonalCorrections()[0].wrong).toBe("He go");

    // And once they connect, the owner's local entry should reach the
    // shared doc (proving sync isn't just silently broken post-sign-in).
    await hooks.connectSync("team-code-regression");
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/team-code-regression");
    expect(doc.entries.some((e) => e.wrong === "He go")).toBe(true);
  });
});

describe("a non-owner's writes are rejected and rolled back", () => {
  it("an anonymous user's added correction disappears locally after the shared log rejects it", async () => {
    const firebase = makeFirebase();
    // Pre-seed the shared doc (as if the real owner already set it up).
    firebase._docs.set("syncedLogs/team-code-5", { entries: [] });

    const { window, hooks } = await loadApp({ firebase });
    await hooks.connectSync("team-code-5"); // anonymous — never signed in as owner
    await wait();

    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(50);

    // Rejected server-side — nothing should have actually been saved,
    // locally or in the shared doc.
    expect(hooks.loadPersonalCorrections()).toEqual([]);
    expect(firebase._docs.get("syncedLogs/team-code-5").entries).toEqual([]);
    expect(document.getElementById("qaAddStatus").textContent).toContain("Only the signed-in owner");
    expect(document.getElementById("qaAddStatus").className).toContain("error");
  });

  it("a non-owner's delete of an existing entry is also rejected and rolled back", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/team-code-6", {
      entries: [{ id: "pc_1", wrong: "He go", right: "He goes", why: "" }]
    });

    const { window, hooks } = await loadApp({ firebase });
    window.confirm = () => true;
    await hooks.connectSync("team-code-6");
    await wait();

    const document = window.document;
    document.getElementById("mistakeSelect").value = "my correction log (personal history)";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    const delBtn = document.querySelector("#mistakeEntry .delete-correction-btn");
    expect(delBtn).toBeTruthy();
    delBtn.click();
    await wait(50);

    expect(hooks.loadPersonalCorrections()).toEqual([
      { id: "pc_1", wrong: "He go", right: "He goes", why: "" }
    ]);
    expect(firebase._docs.get("syncedLogs/team-code-6").entries).toHaveLength(1);
  });
});

describe("signing out", () => {
  it("reverts to anonymous and subsequent writes are rejected again", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("team-code-7");
    await hooks.signOutOwner();

    expect(firebase.auth().currentUser.isAnonymous).toBe(true);

    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(50);

    expect(hooks.loadPersonalCorrections()).toEqual([]);
  });

  it("updates the UI back to the sign-in form", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.signOutOwner();

    const document = window.document;
    expect(document.getElementById("syncSignInForm").style.display).not.toBe("none");
    expect(document.getElementById("syncSignedInPanel").style.display).toBe("none");
  });
});

describe("Firebase not configured or not loaded", () => {
  it("signInAsOwner shows a clear message instead of throwing when firebase never loaded", async () => {
    const { window, hooks } = await loadApp(); // no `firebase` option — global stays undefined
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    expect(window.document.getElementById("syncOwnerAuthStatus").textContent).toContain("placeholder");
  });
});

// Regression coverage for: "I can't unlock admin controls on a second
// device even though I'm the owner." The local PIN is per-device by
// design (js/owner-mode.js), so a legitimate owner landing on a brand
// new phone/laptop that's never had a PIN set needs another way in —
// signing in with the real Firebase owner account should be enough on
// its own, with no local PIN ever required.
describe("a real owner sign-in unlocks admin controls on a device with NO local PIN ever set", () => {
  it("reveals every owner-only box after signing in, with no PIN set at all", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    // The sign-in form itself is NOT owner-gated (it's the unlock
    // mechanism), but everything else still is until it succeeds.
    expect(document.getElementById("syncOwnerAuthSection").style.display).not.toBe("none");
    ["correctionAddBox", "packImportBox", "phrasalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).toBe("none");
    });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);

    ["correctionAddBox", "packImportBox", "phrasalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).not.toBe("none");
    });
    expect(hooks.isDeviceUnlocked()).toBe(true);
    expect(window.OwnerMode.hasOwnerPinSet()).toBe(false); // never touched the local PIN
  });

  it("actually lets you add a correction — not just visually unlocked", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);

    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(50);

    expect(hooks.loadPersonalCorrections()).toHaveLength(1);
    expect(document.getElementById("qaAddStatus").className).toContain("success");
  });

  it("actually lets you add a phrasal word too", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "wind down",
      senses: [{ use: "(verb) To relax before sleep.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);

    const document = window.document;
    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await wait(50);

    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(true);
  });

  it("re-locks after signing out, when no local PIN was ever set as a backup", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    expect(hooks.isDeviceUnlocked()).toBe(true);

    await hooks.signOutOwner();

    expect(hooks.isDeviceUnlocked()).toBe(false);
    expect(window.document.getElementById("correctionAddBox").style.display).toBe("none");
  });

  it("stays unlocked after signing out of Firebase if the local PIN is ALSO set", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await window.OwnerMode.setOwnerPin("1234");
    hooks.updateOwnerModeUI();
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);

    await hooks.signOutOwner();

    expect(hooks.isDeviceUnlocked()).toBe(true); // still unlocked via the local PIN
    expect(window.document.getElementById("correctionAddBox").style.display).not.toBe("none");
  });

  it("regression: the owner sign-in form itself is reachable and clickable on a fresh, never-unlocked device (it IS the unlock mechanism)", async () => {
    // Caught during review: an earlier version of this fix put the
    // sign-in form itself behind isDeviceUnlocked()/the owner-only
    // class, which is a catch-22 — a fresh device can never sign in to
    // become unlocked if the sign-in form is hidden until it's unlocked.
    const firebase = makeFirebase();
    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    expect(document.getElementById("syncOwnerAuthSection").style.display).not.toBe("none");
    expect(document.getElementById("syncSignInBtn").style.display).not.toBe("none");

    document.getElementById("syncOwnerEmailInput").value = OWNER_EMAIL;
    document.getElementById("syncOwnerPasswordInput").value = OWNER_PASSWORD;
    document.getElementById("syncSignInBtn").click();
    await wait(50);

    expect(firebase.auth().currentUser.email).toBe(OWNER_EMAIL);
    expect(document.getElementById("correctionAddBox").style.display).not.toBe("none");
  });

  it("shows a clear error instead of doing nothing when a locked device tries to add a correction directly", async () => {
    const firebase = makeFirebase();
    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait(30);

    expect(document.getElementById("qaAddStatus").textContent).toContain("isn't unlocked");
    expect(document.getElementById("qaAddStatus").className).toContain("error");
  });

  it("shows a clear error instead of doing nothing when a locked device tries to add a phrasal word directly", async () => {
    const firebase = makeFirebase();
    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await wait(30);

    expect(document.getElementById("phrasalAddStatus").textContent).toContain("isn't unlocked");
    expect(document.getElementById("phrasalAddStatus").className).toContain("error");
  });
});
