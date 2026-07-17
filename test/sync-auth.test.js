// Unit tests for js/sync-auth.js — pure helpers, no Firebase SDK
// involved. See test/sync-owner-auth.test.js for the integration tests
// that exercise these against a fake Firebase Auth/Firestore.
import { describe, it, expect } from "vitest";
import SyncAuth from "../js/sync-auth.js";

describe("isOwnerAuthenticated", () => {
  it("is false for no user at all", () => {
    expect(SyncAuth.isOwnerAuthenticated(null)).toBe(false);
    expect(SyncAuth.isOwnerAuthenticated(undefined)).toBe(false);
  });

  it("is false for an anonymous user, even with an email-shaped uid", () => {
    const user = { isAnonymous: true, email: null, emailVerified: false };
    expect(SyncAuth.isOwnerAuthenticated(user)).toBe(false);
  });

  it("is true for a real sign-in even with an UNverified email — a Firebase Console 'Add user' account is never pre-verified", () => {
    const user = { isAnonymous: false, email: "owner@example.com", emailVerified: false };
    expect(SyncAuth.isOwnerAuthenticated(user)).toBe(true);
  });

  it("is true for a real sign-in with no specific owner email required", () => {
    const user = { isAnonymous: false, email: "owner@example.com", emailVerified: true };
    expect(SyncAuth.isOwnerAuthenticated(user)).toBe(true);
  });

  it("checks the email matches when an owner email is given", () => {
    const user = { isAnonymous: false, email: "someone-else@example.com", emailVerified: false };
    expect(SyncAuth.isOwnerAuthenticated(user, "owner@example.com")).toBe(false);
    expect(SyncAuth.isOwnerAuthenticated({ ...user, email: "owner@example.com" }, "owner@example.com")).toBe(true);
  });
});

describe("friendlySignInError", () => {
  it("maps known Firebase Auth error codes to plain English", () => {
    expect(SyncAuth.friendlySignInError({ code: "auth/wrong-password" })).toBe("Incorrect password.");
    expect(SyncAuth.friendlySignInError({ code: "auth/user-not-found" })).toContain("No owner account");
    expect(SyncAuth.friendlySignInError({ code: "auth/too-many-requests" })).toContain("Too many attempts");
  });

  it("falls back to the raw error message for an unrecognized code", () => {
    const msg = SyncAuth.friendlySignInError({ code: "auth/something-new", message: "a new failure mode" });
    expect(msg).toContain("a new failure mode");
  });

  it("doesn't throw on a missing or malformed error", () => {
    expect(() => SyncAuth.friendlySignInError(null)).not.toThrow();
    expect(() => SyncAuth.friendlySignInError(undefined)).not.toThrow();
    expect(SyncAuth.friendlySignInError({})).toContain("unknown error");
  });
});

describe("friendlyWriteError", () => {
  it("gives a specific, actionable message for a permission-denied rejection", () => {
    const msg = SyncAuth.friendlyWriteError({ code: "permission-denied" });
    expect(msg).toContain("Only the signed-in owner");
    expect(msg).toContain("saved on this device");
  });

  it("falls back to the raw error message for anything else", () => {
    const msg = SyncAuth.friendlyWriteError({ code: "unavailable", message: "The service is down." });
    expect(msg).toContain("The service is down.");
  });

  it("doesn't throw on a missing error", () => {
    expect(() => SyncAuth.friendlyWriteError(null)).not.toThrow();
  });
});
