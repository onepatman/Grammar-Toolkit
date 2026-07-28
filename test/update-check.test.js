// Unit tests for js/update-check.js — the GitHub-Releases update check.
// Network access is always mocked; these never make a real HTTP request.
import { describe, it, expect, vi } from "vitest";
import UpdateCheck from "../js/update-check.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe("isNewerVersion", () => {
  it("returns true when the latest tag is numerically greater", () => {
    expect(UpdateCheck.isNewerVersion("1.0.0", "v1.1.0")).toBe(true);
    expect(UpdateCheck.isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    expect(UpdateCheck.isNewerVersion("1.9.9", "1.10.0")).toBe(true);
  });

  it("compares numerically, not as strings (v9 is older than v10)", () => {
    expect(UpdateCheck.isNewerVersion("9.0.0", "10.0.0")).toBe(true);
    expect(UpdateCheck.isNewerVersion("10.0.0", "9.0.0")).toBe(false);
  });

  it("returns false for an equal or older version", () => {
    expect(UpdateCheck.isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(UpdateCheck.isNewerVersion("1.5.0", "1.4.9")).toBe(false);
  });

  it("handles a leading 'v' on either side and differing segment counts", () => {
    expect(UpdateCheck.isNewerVersion("v1.0", "v1.0.1")).toBe(true);
    expect(UpdateCheck.isNewerVersion("1.0.0", "1.0")).toBe(false);
  });

  it("falls back to a simple inequality check for a non-semver tag, never crashing", () => {
    expect(UpdateCheck.isNewerVersion("1.0.0", "release-candidate")).toBe(true);
    expect(UpdateCheck.isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });
});

describe("extractReleaseNotes", () => {
  it("pulls out '- ' bulleted lines as the notes list", () => {
    const body = "## What's new\n- Improved dictionary accuracy\n- Added engineering words\n- Bug fixes";
    expect(UpdateCheck.extractReleaseNotes(body)).toEqual([
      "Improved dictionary accuracy",
      "Added engineering words",
      "Bug fixes"
    ]);
  });

  it("also recognizes '* ' bullets", () => {
    const body = "* One\n* Two";
    expect(UpdateCheck.extractReleaseNotes(body)).toEqual(["One", "Two"]);
  });

  it("falls back to plain non-heading lines when there are no bullets at all", () => {
    const body = "# Release 2.0\nThis release improves accuracy.\nAlso fixes a bug.";
    expect(UpdateCheck.extractReleaseNotes(body)).toEqual([
      "This release improves accuracy.",
      "Also fixes a bug."
    ]);
  });

  it("returns an empty array (never invented notes) for an empty body", () => {
    expect(UpdateCheck.extractReleaseNotes("")).toEqual([]);
    expect(UpdateCheck.extractReleaseNotes(null)).toEqual([]);
  });

  it("caps the number of notes returned", () => {
    const body = Array.from({ length: 20 }, (_, i) => `- note ${i}`).join("\n");
    expect(UpdateCheck.extractReleaseNotes(body, 3)).toHaveLength(3);
  });
});

describe("checkForUpdate", () => {
  it("reports hasUpdate:true with the tag and parsed release notes when the latest release is newer", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({
      tag_name: "v2.1.0",
      body: "- Improved dictionary accuracy\n- Bug fixes",
      html_url: "https://github.com/onepatman/Grammar-Toolkit/releases/tag/v2.1.0"
    }));
    const result = await UpdateCheck.checkForUpdate({
      owner: "onepatman", repo: "Grammar-Toolkit", currentVersion: "1.0.0", fetchImpl, isOnline: () => true
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      UpdateCheck.buildReleasesUrl("onepatman", "Grammar-Toolkit"),
      expect.any(Object)
    );
    expect(result.hasUpdate).toBe(true);
    expect(result.latestVersion).toBe("v2.1.0");
    expect(result.releaseNotes).toEqual(["Improved dictionary accuracy", "Bug fixes"]);
    expect(result.htmlUrl).toContain("v2.1.0");
  });

  it("reports hasUpdate:false when already on the latest version", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ tag_name: "v1.0.0", body: "" }));
    const result = await UpdateCheck.checkForUpdate({
      owner: "onepatman", repo: "Grammar-Toolkit", currentVersion: "1.0.0", fetchImpl, isOnline: () => true
    });
    expect(result.hasUpdate).toBe(false);
  });

  it("resolves hasUpdate:false (never throws) when the repo has no releases yet (404)", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({}, false));
    const result = await UpdateCheck.checkForUpdate({
      owner: "onepatman", repo: "Grammar-Toolkit", currentVersion: "1.0.0", fetchImpl, isOnline: () => true
    });
    expect(result.hasUpdate).toBe(false);
  });

  it("resolves hasUpdate:false (never throws) on a network failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await UpdateCheck.checkForUpdate({
      owner: "onepatman", repo: "Grammar-Toolkit", currentVersion: "1.0.0", fetchImpl, isOnline: () => true
    });
    expect(result.hasUpdate).toBe(false);
  });

  it("never attempts a request while offline", async () => {
    const fetchImpl = vi.fn();
    const result = await UpdateCheck.checkForUpdate({
      owner: "onepatman", repo: "Grammar-Toolkit", currentVersion: "1.0.0", fetchImpl, isOnline: () => false
    });
    expect(result.hasUpdate).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves hasUpdate:false when required options are missing, without attempting a request", async () => {
    const fetchImpl = vi.fn();
    const result = await UpdateCheck.checkForUpdate({ owner: "onepatman", fetchImpl, isOnline: () => true });
    expect(result.hasUpdate).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
