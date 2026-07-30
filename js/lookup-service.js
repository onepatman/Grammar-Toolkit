/* =========================================================
   Lookup abstraction layer — Phase 1 of the two-phase architecture plan
   (see project history): the UI never calls a dictionary/translation
   API directly. It calls a stable service interface
   (OnlineLookupService.lookup / TranslationService.translate /
   TranslationService.translateToEnglish), and each service delegates to
   an injected PROVIDER object.

   Why this exists: today the only real providers are the free, keyless,
   CORS-enabled sources this app has always used (Free Dictionary API +
   Wiktionary for English via js/online-lookup.js, MyMemory for Tagalog
   via js/tagalog-lookup.js) — a real Merriam-Webster/Cambridge/Oxford/
   Collins/Pinoy-Dictionary/AI-generated-summary integration needs a
   backend to hold API keys and proxy CORS-blocked requests, which this
   static PWA doesn't have (see Phase 2). Wrapping today's sources behind
   this seam means that when Phase 2's backend exists, only a NEW
   provider object needs to be written and swapped in here — every
   caller (search, every tab's "Look Up & Add", the editors) keeps
   calling the exact same OnlineLookupService.lookup()/
   TranslationService.translate() it already does today, completely
   unaware of where the data actually came from.

   A provider's contract:
     LookupProvider:      { name: string, lookup(word, options) -> Promise<WordEntry|null> }
     TranslationProvider: { name: string,
                             translate(word, options) -> Promise<TranslationResult|null>,
                             translateToEnglish(word, options) -> Promise<TranslationResult|null> }
   `options` is passed straight through to the provider (cache, signal,
   isOnline, fetchImpl, etc. — see js/online-lookup.js and
   js/tagalog-lookup.js for what today's default providers accept).
   Neither service interprets or mutates the result — whatever shape the
   active provider resolves to is exactly what the caller gets. Today's
   default providers return the same WordEntry-ish shape
   (js/online-lookup.js) and TranslationResult shape
   (js/tagalog-lookup.js) the rest of the app has always rendered/saved,
   so swapping THIS module in is a pure refactor: zero behavior change.

   Loaded as a plain browser <script> (attaches window.LookupService) and
   as a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.LookupService = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  // ---------- Default providers: wrap today's free, keyless sources ----------

  // Wraps js/online-lookup.js's fetchOnlineDefinition (Free Dictionary
  // API, then Wiktionary, then Wiktionary search) as a LookupProvider.
  function createFreeDictionaryProvider(OnlineLookupModule) {
    if (!OnlineLookupModule) throw new Error("createFreeDictionaryProvider requires the OnlineLookup module");
    return {
      name: "free-dictionary",
      lookup: function (word, options) {
        return OnlineLookupModule.fetchOnlineDefinition(word, options);
      }
    };
  }

  // Wraps js/tagalog-lookup.js's fetchTagalogTranslation/
  // fetchEnglishTranslation (MyMemory) as a TranslationProvider.
  function createMyMemoryProvider(TagalogLookupModule) {
    if (!TagalogLookupModule) throw new Error("createMyMemoryProvider requires the TagalogLookup module");
    return {
      name: "mymemory",
      translate: function (word, options) {
        return TagalogLookupModule.fetchTagalogTranslation(word, options);
      },
      translateToEnglish: function (word, options) {
        return TagalogLookupModule.fetchEnglishTranslation(word, options);
      }
    };
  }

  // ---------- Services: the only thing the rest of the app talks to ----------

  function createOnlineLookupService(config) {
    var cfg = config || {};
    if (!cfg.provider || typeof cfg.provider.lookup !== "function") {
      throw new Error("createOnlineLookupService requires a provider with a lookup(word, options) function");
    }
    var provider = cfg.provider;
    return {
      providerName: provider.name,
      lookup: function (word, options) {
        return provider.lookup(word, options);
      }
    };
  }

  function createTranslationService(config) {
    var cfg = config || {};
    if (!cfg.provider || typeof cfg.provider.translate !== "function") {
      throw new Error("createTranslationService requires a provider with a translate(word, options) function");
    }
    var provider = cfg.provider;
    return {
      providerName: provider.name,
      translate: function (word, options) {
        return provider.translate(word, options);
      },
      // Optional on a provider — not every future provider needs to
      // support the reverse direction, so this degrades to "no result"
      // rather than throwing when a provider doesn't implement it.
      translateToEnglish: function (word, options) {
        return typeof provider.translateToEnglish === "function"
          ? provider.translateToEnglish(word, options)
          : Promise.resolve(null);
      }
    };
  }

  return {
    createFreeDictionaryProvider: createFreeDictionaryProvider,
    createMyMemoryProvider: createMyMemoryProvider,
    createOnlineLookupService: createOnlineLookupService,
    createTranslationService: createTranslationService
  };
});
