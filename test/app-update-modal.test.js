// Integration tests for the "A New Version is Available" popup wired
// into index.html (checkForAppUpdate/showAppUpdateModal/hideAppUpdateModal
// — see js/update-check.js for the underlying GitHub-release check).
// Loads the real index.html in jsdom; network is always mocked via
// window.fetch, never a real request.
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe("App update popup", () => {
  it("does not check for updates when window.fetch is unavailable (the default in this test harness), and stays hidden", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    expect(document.getElementById("appUpdateModal").style.display).toBe("none");
    expect(typeof hooks.checkForAppUpdate).toBe("function");
  });

  it("shows the modal with the real version and release notes when a newer GitHub release exists", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.fetch = vi.fn(() => jsonResponse({
      tag_name: "v2.1.0",
      body: "- Improved dictionary accuracy\n- Added engineering words\n- Bug fixes"
    }));

    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.getElementById("appUpdateModal").style.display).toBe("flex");
    expect(document.getElementById("appUpdateVersionText").textContent).toBe("v2.1.0");
    const notes = Array.from(document.querySelectorAll("#appUpdateNotesList li")).map((li) => li.textContent);
    expect(notes).toEqual(["Improved dictionary accuracy", "Added engineering words", "Bug fixes"]);
  });

  it("stays hidden when already on the latest version", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.fetch = vi.fn(() => jsonResponse({ tag_name: `v${hooks.APP_VERSION}`, body: "" }));

    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.getElementById("appUpdateModal").style.display).toBe("none");
  });

  it("'Later' hides the modal and remembers the dismissal for that specific version", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.fetch = vi.fn(() => jsonResponse({ tag_name: "v3.0.0", body: "- Something new" }));

    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.getElementById("appUpdateModal").style.display).toBe("flex");

    document.getElementById("appUpdateLaterBtn").click();
    expect(document.getElementById("appUpdateModal").style.display).toBe("none");
    expect(window.sessionStorage.getItem(hooks.UPDATE_DISMISSED_KEY)).toBe("v3.0.0");

    // Re-checking for the SAME version doesn't re-show the popup the
    // user just dismissed.
    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.getElementById("appUpdateModal").style.display).toBe("none");
  });

  it("'Update Now' asks the service worker registration to check for a new version before reloading", async () => {
    // jsdom's window.location.reload can't be reassigned or spied on
    // (non-configurable, navigation is unimplemented) — verified
    // instead via the observable step that happens right before the
    // reload: asking the SW registration to check for a new script.
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.fetch = vi.fn(() => jsonResponse({ tag_name: "v4.0.0", body: "- Fixes" }));
    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.getElementById("appUpdateModal").style.display).toBe("flex");

    const update = vi.fn(() => Promise.resolve());
    window.navigator.serviceWorker = { getRegistration: vi.fn(() => Promise.resolve({ update })) };

    document.getElementById("appUpdateNowBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(window.navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it("never displays a fabricated release note when the release body is empty", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.fetch = vi.fn(() => jsonResponse({ tag_name: "v5.0.0", body: "" }));

    hooks.checkForAppUpdate();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const notes = Array.from(document.querySelectorAll("#appUpdateNotesList li")).map((li) => li.textContent);
    expect(notes).toEqual(["See the release page for details."]);
  });
});
