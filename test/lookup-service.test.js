// Unit tests for js/lookup-service.js — the provider-abstraction seam
// (Phase 1 of the two-phase architecture plan) that sits between the
// app's UI and whichever dictionary/translation source is actually
// providing data. Today's default providers just wrap the existing
// js/online-lookup.js and js/tagalog-lookup.js modules (Free Dictionary
// API/Wiktionary, MyMemory) with zero behavior change; a future Phase 2
// backend-backed provider only needs to satisfy the same contract to be
// swapped in, without any caller (search, "Look Up & Add", editors)
// changing at all.
import { describe, it, expect, vi } from "vitest";
import LookupService from "../js/lookup-service.js";

describe("createOnlineLookupService", () => {
  it("throws when constructed without a provider", () => {
    expect(() => LookupService.createOnlineLookupService({})).toThrow();
    expect(() => LookupService.createOnlineLookupService()).toThrow();
  });

  it("throws when the provider has no lookup() function", () => {
    expect(() => LookupService.createOnlineLookupService({ provider: { name: "x" } })).toThrow();
  });

  it("delegates lookup(word, options) to the provider unchanged, and returns exactly what it resolves to", async () => {
    const fakeResult = { w: "test", senses: [{ use: "(noun) A trial.", examples: [] }], syn: [], ant: [] };
    const provider = { name: "fake", lookup: vi.fn().mockResolvedValue(fakeResult) };
    const service = LookupService.createOnlineLookupService({ provider });

    const options = { cache: "some-cache" };
    const result = await service.lookup("test", options);

    expect(provider.lookup).toHaveBeenCalledWith("test", options);
    expect(result).toBe(fakeResult);
  });

  it("exposes the active provider's name", () => {
    const provider = { name: "free-dictionary", lookup: vi.fn() };
    const service = LookupService.createOnlineLookupService({ provider });
    expect(service.providerName).toBe("free-dictionary");
  });

  it("propagates a null result (word not found) without transformation", async () => {
    const provider = { name: "fake", lookup: vi.fn().mockResolvedValue(null) };
    const service = LookupService.createOnlineLookupService({ provider });
    expect(await service.lookup("zzznotarealword")).toBeNull();
  });

  it("swapping the provider changes what's returned with no change to the service's own interface", async () => {
    const providerA = { name: "a", lookup: vi.fn().mockResolvedValue({ w: "from-a" }) };
    const providerB = { name: "b", lookup: vi.fn().mockResolvedValue({ w: "from-b" }) };

    const serviceA = LookupService.createOnlineLookupService({ provider: providerA });
    const serviceB = LookupService.createOnlineLookupService({ provider: providerB });

    expect((await serviceA.lookup("x")).w).toBe("from-a");
    expect((await serviceB.lookup("x")).w).toBe("from-b");
  });
});

describe("createFreeDictionaryProvider", () => {
  it("throws without an OnlineLookup module", () => {
    expect(() => LookupService.createFreeDictionaryProvider()).toThrow();
  });

  it("wraps OnlineLookup.fetchOnlineDefinition exactly, forwarding word/options and returning its result untouched", async () => {
    const fakeResult = { w: "wrapped", senses: [] };
    const fetchOnlineDefinition = vi.fn().mockResolvedValue(fakeResult);
    const provider = LookupService.createFreeDictionaryProvider({ fetchOnlineDefinition });

    expect(provider.name).toBe("free-dictionary");
    const options = { cache: { get: () => undefined, set: () => {} } };
    const result = await provider.lookup("wrapped", options);

    expect(fetchOnlineDefinition).toHaveBeenCalledWith("wrapped", options);
    expect(result).toBe(fakeResult);
  });
});

describe("createTranslationService", () => {
  it("throws when constructed without a provider with translate()", () => {
    expect(() => LookupService.createTranslationService({})).toThrow();
    expect(() => LookupService.createTranslationService({ provider: { name: "x" } })).toThrow();
  });

  it("delegates translate(word, options) to the provider unchanged", async () => {
    const fakeResult = { candidates: ["salita"], quality: 0.9 };
    const provider = { name: "fake", translate: vi.fn().mockResolvedValue(fakeResult) };
    const service = LookupService.createTranslationService({ provider });

    const result = await service.translate("word", { cache: "c" });
    expect(provider.translate).toHaveBeenCalledWith("word", { cache: "c" });
    expect(result).toBe(fakeResult);
  });

  it("delegates translateToEnglish(word, options) when the provider implements it", async () => {
    const fakeResult = { candidates: ["hello"], quality: 0.8 };
    const provider = {
      name: "fake",
      translate: vi.fn(),
      translateToEnglish: vi.fn().mockResolvedValue(fakeResult)
    };
    const service = LookupService.createTranslationService({ provider });

    const result = await service.translateToEnglish("salita", { cache: "c" });
    expect(provider.translateToEnglish).toHaveBeenCalledWith("salita", { cache: "c" });
    expect(result).toBe(fakeResult);
  });

  it("resolves translateToEnglish to null (never throws) when the provider doesn't implement the reverse direction", async () => {
    const provider = { name: "fake", translate: vi.fn() };
    const service = LookupService.createTranslationService({ provider });
    expect(await service.translateToEnglish("salita")).toBeNull();
  });
});

describe("createMyMemoryProvider", () => {
  it("throws without a TagalogLookup module", () => {
    expect(() => LookupService.createMyMemoryProvider()).toThrow();
  });

  it("wraps fetchTagalogTranslation/fetchEnglishTranslation exactly, forwarding args and returning results untouched", async () => {
    const tagalogResult = { candidates: ["salita"] };
    const englishResult = { candidates: ["word"] };
    const fetchTagalogTranslation = vi.fn().mockResolvedValue(tagalogResult);
    const fetchEnglishTranslation = vi.fn().mockResolvedValue(englishResult);
    const provider = LookupService.createMyMemoryProvider({ fetchTagalogTranslation, fetchEnglishTranslation });

    expect(provider.name).toBe("mymemory");

    const options = { cache: { get: () => undefined, set: () => {} } };
    expect(await provider.translate("word", options)).toBe(tagalogResult);
    expect(fetchTagalogTranslation).toHaveBeenCalledWith("word", options);

    expect(await provider.translateToEnglish("salita", options)).toBe(englishResult);
    expect(fetchEnglishTranslation).toHaveBeenCalledWith("salita", options);
  });
});
