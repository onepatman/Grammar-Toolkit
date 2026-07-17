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

  it("does nothing (and shows an error) via the actual sign-in button when the device is locally locked", async () => {
    const firebase = makeFirebase();
    const { window } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    document.getElementById("syncOwnerEmailInput").value = OWNER_EMAIL;
    document.getElementById("syncOwnerPasswordInput").value = OWNER_PASSWORD;
    document.getElementById("syncSignInBtn").click();
    await wait();

    expect(firebase.auth().currentUser).toBeNull();
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
