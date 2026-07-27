# Vocabulary entry verification metadata — proposed schema

This describes a new `verified` field to add to each `vocabData` entry in
`index.html`, so it's possible to tell at a glance which entries have
actually been checked against a standard dictionary and which haven't.
**Not applied to the data yet** — this is the design, pending approval.

## Field shape

```json
{
  "w": "juggle",
  "senses": [ ... ],
  "tagalog": "...",
  "verified": {
    "status": "needs_review",
    "checkedAgainst": null,
    "lastAuditedAt": "2026-07-27",
    "heuristicFlags": ["translation_missing_or_untranslated"]
  }
}
```

- **`status`** — one of:
  - `"needs_review"` — default for every entry until it's actually been
    checked (the honest starting state for all 795 built-ins right now;
    none have been cross-checked against an external reference yet).
  - `"heuristic_pass"` — passed every automated structural check in
    `scripts/audit-vocab.js`, but has NOT been semantically verified
    against a standard dictionary. This is NOT the same as "correct" —
    it only means no structural red flag was found (see the "juggle"
    case: a real mistranslation would show this status too, since
    heuristics can't catch semantic errors).
  - `"semantically_reviewed"` — a human or LLM has actually compared the
    definition/example/translation against a standard reference
    (Merriam-Webster, Oxford, or equivalent) and confirmed it's accurate,
    or corrected it. This is the only status that should read as "you
    can trust this at a glance."
  - `"flagged"` — a real issue was found (heuristically or during
    semantic review) and is pending a decision on the proposed
    correction.
- **`checkedAgainst`** — `null`, or a short string naming the reference
  used for `semantically_reviewed` entries (e.g. `"merriam-webster"`,
  `"oxford"`, `"llm_review"` if no external source was consulted).
- **`lastAuditedAt`** — ISO date the entry was last touched by the audit
  script or a manual review pass.
- **`heuristicFlags`** — array of the heuristic check names from
  `scripts/audit-vocab.js` that fired for this entry (empty for a clean
  pass), kept even after the entry is corrected so there's a record of
  what was originally wrong.

## Why not just a single `verified: true/false` boolean

A boolean can't distinguish "nobody has looked at this yet" from
"someone looked and confirmed it's fine" — both would show as `false`
today. Given the scale here (795 entries, only 86 flagged by heuristics
so far, semantic review only completed for those 86 as of this pass),
collapsing that distinction would make "unverified" and "not yet
reached" look identical, which defeats the actual goal ("tell me which
entries are trustworthy at a glance").

## Rollout plan (not yet executed)

1. Add `verified: {status: "needs_review", checkedAgainst: null,
   lastAuditedAt: null, heuristicFlags: []}` to all 795 entries as a
   baseline (mechanical, safe, no content changes).
2. Run `scripts/audit-vocab.js` and set `status` to `"heuristic_pass"`
   or `"flagged"` + `heuristicFlags` accordingly for all 795.
3. As each flagged entry's proposed correction is approved and applied,
   set `status: "semantically_reviewed"`, `checkedAgainst`, and
   `lastAuditedAt`.
4. Entries that passed heuristics but haven't had a human/LLM semantic
   pass stay at `"heuristic_pass"` until that pass happens — this is the
   honest state for the ~709 entries not yet flagged by anything, since
   heuristics alone cannot claim Merriam-Webster-level verification (see
   the "juggle" case in the audit report).

Step 1 is a pure, low-risk mechanical change (same shape as the recent
`addedAt`/`modifiedAt` timestamp rollout to Language Bank/Distinctions
entries) and could be applied on its own without waiting on the full
semantic review. Steps 2-4 depend on the corrections actually being
reviewed and approved first.
