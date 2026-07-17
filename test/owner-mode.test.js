// Unit tests for js/owner-mode.js — the PIN-gated owner/admin deterrent.
// Uses Node's real Web Crypto (globalThis.crypto.subtle) and an
// in-memory storage stand-in so these never touch a real localStorage.
import { describe, it, expect, beforeEach } from "vitest";
import OwnerMode from "../js/owner-mode.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

describe("hasOwnerPinSet", () => {
  it("is false before any PIN has been set", () => {
    const storage = fakeStorage();
    expect(OwnerMode.hasOwnerPinSet({ storage })).toBe(false);
  });

  it("is true once a PIN has been set", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    expect(OwnerMode.hasOwnerPinSet({ storage })).toBe(true);
  });
});

describe("setOwnerPin", () => {
  it("rejects a PIN shorter than the minimum length without storing anything", async () => {
    const storage = fakeStorage();
    const ok = await OwnerMode.setOwnerPin("12", { storage });
    expect(ok).toBe(false);
    expect(OwnerMode.hasOwnerPinSet({ storage })).toBe(false);
  });

  it("stores a hash, not the raw PIN", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    const stored = storage._map.get("mepf_toolkit_owner_pin_hash");
    expect(stored).toBeTruthy();
    expect(stored).not.toBe("1234");
    expect(stored).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex digest
  });

  it("immediately unlocks the device that just set the PIN", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    expect(OwnerMode.isOwnerModeUnlocked({ storage })).toBe(true);
  });

  it("trims whitespace before validating and hashing", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("  1234  ", { storage });
    const unlocked = await OwnerMode.unlockOwnerMode("1234", { storage });
    expect(unlocked).toBe(true);
  });
});

describe("unlockOwnerMode", () => {
  let storage;
  beforeEach(async () => {
    storage = fakeStorage();
    await OwnerMode.setOwnerPin("5678", { storage });
    OwnerMode.lockOwnerMode({ storage }); // start each test locked
  });

  it("unlocks with the correct PIN", async () => {
    const ok = await OwnerMode.unlockOwnerMode("5678", { storage });
    expect(ok).toBe(true);
    expect(OwnerMode.isOwnerModeUnlocked({ storage })).toBe(true);
  });

  it("refuses an incorrect PIN and leaves the device locked", async () => {
    const ok = await OwnerMode.unlockOwnerMode("0000", { storage });
    expect(ok).toBe(false);
    expect(OwnerMode.isOwnerModeUnlocked({ storage })).toBe(false);
  });

  it("returns false when no PIN has ever been set on this device", async () => {
    const freshStorage = fakeStorage();
    const ok = await OwnerMode.unlockOwnerMode("anything", { storage: freshStorage });
    expect(ok).toBe(false);
  });
});

describe("lockOwnerMode", () => {
  it("locks a device without forgetting the PIN (it can be unlocked again)", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    OwnerMode.lockOwnerMode({ storage });
    expect(OwnerMode.isOwnerModeUnlocked({ storage })).toBe(false);
    expect(OwnerMode.hasOwnerPinSet({ storage })).toBe(true);

    const ok = await OwnerMode.unlockOwnerMode("1234", { storage });
    expect(ok).toBe(true);
  });
});

describe("isOwnerModeUnlocked", () => {
  it("is false with no storage available", () => {
    expect(OwnerMode.isOwnerModeUnlocked({ storage: null })).toBe(false);
  });
});

describe("resetOwnerPin", () => {
  it("clears both the PIN hash and the unlocked flag, returning to the unclaimed state", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    OwnerMode.resetOwnerPin({ storage });
    expect(OwnerMode.hasOwnerPinSet({ storage })).toBe(false);
    expect(OwnerMode.isOwnerModeUnlocked({ storage })).toBe(false);
  });

  it("allows setting a brand new PIN after a reset", async () => {
    const storage = fakeStorage();
    await OwnerMode.setOwnerPin("1234", { storage });
    OwnerMode.resetOwnerPin({ storage });
    await OwnerMode.setOwnerPin("9999", { storage });
    expect(await OwnerMode.unlockOwnerMode("9999", { storage })).toBe(true);
    expect(await OwnerMode.unlockOwnerMode("1234", { storage })).toBe(false);
  });
});
