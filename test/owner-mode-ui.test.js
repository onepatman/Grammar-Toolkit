// Integration tests for the Owner Access UI and the gating it applies to
// admin controls (add/edit/delete corrections, connect sync, import a
// pack, add a phrasal word). Loads the real index.html in jsdom.
// Every test here starts LOCKED (ownerUnlocked: false) — the opposite of
// every other test file's default — so the read-only behavior itself is
// what's under test.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("a locked device (no PIN set yet)", () => {
  it("hides every admin control", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    ["correctionAddBox", "syncOwnerAuthSection", "packImportBox", "phrasalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).toBe("none");
    });
  });

  it("still shows the Sync box itself (connecting to view is not owner-gated)", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    expect(document.getElementById("syncBox").style.display).not.toBe("none");
    expect(document.getElementById("syncCodeInput")).toBeTruthy();
    expect(document.getElementById("syncConnectBtn")).toBeTruthy();
  });

  it("shows the set-PIN form, not the unlock form", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    expect(document.getElementById("ownerSetPinForm").style.display).not.toBe("none");
    expect(document.getElementById("ownerUnlockForm").style.display).toBe("none");
  });

  it("refuses to add a correction even if the form is filled in and submitted directly", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait();
    expect(hooks.loadPersonalCorrections()).toEqual([]);
  });

  it("refuses to add a phrasal word", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await wait();
    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(false);
  });

  it("refuses to import an offline pack", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    const input = document.getElementById("packImportInput");
    const file = new window.File(
      [JSON.stringify([{ w: "smuggled", senses: [{ use: "x", examples: [] }] }])],
      "pack.json",
      { type: "application/json" }
    );
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new window.Event("change"));
    await wait(50);
    expect(hooks.vocabData.some((v) => v.w === "smuggled")).toBe(false);
  });
});

describe("locking a device that already has personal corrections", () => {
  it("hides Edit/Delete buttons on personal correction log entries once the device is locked", async () => {
    // Start unlocked so a personal correction can be added, then lock
    // this same session and confirm the edit/delete controls disappear.
    const { window } = await loadApp({ ownerUnlocked: true });
    const document = window.document;
    document.getElementById("qaWrongInput").value = "He go";
    document.getElementById("qaRightInput").value = "He goes";
    document.getElementById("qaAddBtn").click();
    await wait();

    document.getElementById("mistakeSelect").value = "my correction log (personal history)";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.querySelectorAll("#mistakeEntry .edit-correction-btn").length).toBeGreaterThan(0);

    document.getElementById("ownerLockBtn").click();
    await wait();
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));

    expect(document.querySelectorAll("#mistakeEntry .edit-correction-btn")).toHaveLength(0);
    expect(document.querySelectorAll("#mistakeEntry .delete-correction-btn")).toHaveLength(0);
  });
});

describe("setting an owner PIN", () => {
  it("rejects a PIN shorter than the minimum and stays locked", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("ownerNewPinInput").value = "12";
    document.getElementById("ownerSetPinBtn").click();
    await wait();
    expect(document.getElementById("ownerAccessStatus").textContent).toContain("at least");
    expect(document.getElementById("correctionAddBox").style.display).toBe("none");
  });

  it("unlocks this device and reveals every admin control", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("ownerNewPinInput").value = "1234";
    document.getElementById("ownerSetPinBtn").click();
    await wait();

    ["correctionAddBox", "syncOwnerAuthSection", "packImportBox", "phrasalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).not.toBe("none");
    });
    expect(document.getElementById("ownerAccessStatus").textContent).toContain("Unlocked");
  });
});

describe("unlocking with an existing PIN", () => {
  it("unlocks with the correct PIN", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    await window.OwnerMode.setOwnerPin("4242");
    window.OwnerMode.lockOwnerMode();
    hooks.updateOwnerModeUI();

    document.getElementById("ownerUnlockPinInput").value = "4242";
    document.getElementById("ownerUnlockBtn").click();
    await wait();

    expect(document.getElementById("correctionAddBox").style.display).not.toBe("none");
  });

  it("refuses an incorrect PIN and keeps admin controls hidden", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    await window.OwnerMode.setOwnerPin("4242");
    window.OwnerMode.lockOwnerMode();
    window.__TOOLKIT_TEST_HOOKS__.updateOwnerModeUI();

    document.getElementById("ownerUnlockPinInput").value = "0000";
    document.getElementById("ownerUnlockBtn").click();
    await wait();

    expect(document.getElementById("ownerAccessStatus").textContent).toContain("Incorrect");
    expect(document.getElementById("correctionAddBox").style.display).toBe("none");
  });
});

describe("locking a device again", () => {
  it("re-hides admin controls without forgetting the PIN", async () => {
    const { window } = await loadApp({ ownerUnlocked: true });
    const document = window.document;
    await window.OwnerMode.setOwnerPin("1234");
    window.__TOOLKIT_TEST_HOOKS__.updateOwnerModeUI();

    document.getElementById("ownerLockBtn").click();
    await wait();

    expect(document.getElementById("correctionAddBox").style.display).toBe("none");
    expect(window.OwnerMode.hasOwnerPinSet()).toBe(true);
  });
});

describe("forgot-PIN reset", () => {
  it("clears the PIN and returns to the unclaimed (set-PIN) state", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    await window.OwnerMode.setOwnerPin("1234");
    window.OwnerMode.lockOwnerMode();
    window.__TOOLKIT_TEST_HOOKS__.updateOwnerModeUI();

    const originalConfirm = window.confirm;
    window.confirm = () => true;
    document.getElementById("ownerForgotPinBtn").click();
    window.confirm = originalConfirm;
    await wait();

    expect(window.OwnerMode.hasOwnerPinSet()).toBe(false);
    expect(document.getElementById("ownerSetPinForm").style.display).not.toBe("none");
  });

  it("does nothing if the confirmation is declined", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    await window.OwnerMode.setOwnerPin("1234");
    window.OwnerMode.lockOwnerMode();
    window.__TOOLKIT_TEST_HOOKS__.updateOwnerModeUI();

    const originalConfirm = window.confirm;
    window.confirm = () => false;
    document.getElementById("ownerForgotPinBtn").click();
    window.confirm = originalConfirm;
    await wait();

    expect(window.OwnerMode.hasOwnerPinSet()).toBe(true);
  });
});

describe("read-only access still works while locked", () => {
  it("search, browsing, and favoriting all work normally with no PIN unlocked", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;

    hooks.runSearchPipeline("abandon");
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Vocabulary Bank"));
    expect(match).toBeTruthy();
    match.click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");

    const favToggle = document.querySelector("#vocabEntry .fav-toggle");
    favToggle.click();
    expect(favToggle.classList.contains("active")).toBe(true);
  });
});
