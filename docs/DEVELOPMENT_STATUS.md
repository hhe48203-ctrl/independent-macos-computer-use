# Current checkpoint: 2026-10-24

[中文版本](zh-CN/DEVELOPMENT_STATUS.md)

Delivered through v1.3.0: the `js`/`js_reset` REPL with app objects, real background input, original coordinate/modifier/scroll compatibility, the cooperative input profile and target-aware cursor visibility. Each release tag is backed by its own regression count and evidence index ([v1.1](validation-index-v1.1.json), [v1.2](validation-index-v1.2.json), [v1.3](validation-index-v1.3.json)); the current suite is 51 passing checks with no skips.

This checkpoint was written while wrapping up, so the remaining work is listed explicitly rather than left implied.

## Remaining work

1. **The recorded original baseline is stale.** The install has moved to Codex `26.1021.31345` (build 21828), `@oai/sky` 0.7.13 and native SHA-256 `47ad8bdd901e4e55de649c319e8590eda3308f5f69c11d75486e13bd90bedeb7`, while [original-baseline.json](original-baseline.json) still records `26.1016.61520` / sky 0.7.12. `node scripts/reference-baseline.mjs --check` now exits 1, which is the intended behavior. The manifest was deliberately **not** refreshed: refreshing it asserts acceptance, and no original behavior comparison has been run against the new build. The identity and the AX Raise observation for the new install are recorded in [INPUT_ISOLATION.md](INPUT_ISOLATION.md).
2. **Original behavior comparison for the new build** (10-step document scenario, cursor candidates, scroll distances) is not done, so Unicode, JPEG/pixel-coordinate and scroll differences are still only known for the previous build.
3. **No new human acceptance** beyond the v1.2 cooperative comparison. Experimental raw long-hold input, third-party applications and physical multi-display remain unverified by a person.
4. **Unproven mechanisms** stay unproven: the original's exact AX Raise decision branch and audit token, the unique historical IME cause, the full ViewBridge focus-suppression/reroute state machine, and the original's own Unicode text-conversion path.
5. **Scope exclusions** are unchanged and intentional: no browser API, no rich-text paste, no horizontal scroll compatibility claim, no lock screen/hidden desktop, Intel and other macOS versions untested.
6. **Distribution**: the v1.1.0–v1.3.0 tags and release evidence were local until this checkpoint; no packages were published outside the private repository.

## What was accepted

| Version | Accepted change | Checks |
| --- | --- | --- |
| v1.3.0 | target-occluded cursor with optional `always` mode | 51 regressions, live covered operations, extracted ZIP, 1×/2× offscreen pixels |
| v1.2.0 | cooperative input profile without synthetic AppKit activation; pi configuration migrated | 49 regressions, packaged five-scenario gate, one accepted cooperative human comparison |
| v1.1.0 | original pixel coordinates, modifier/timed input, calibrated vertical scroll, reconnect | 39 regressions, 20 scroll cases, packaged and source-archive acceptance |
| v1.0.0 | persistent `js` REPL, independent cursor, background real input | 25 regressions plus human rounds retained with their failures |

---

# v1.0.0 delivery checkpoint (2026-10-19 UTC)

The functional and local human phase is complete: only `js`/`js_reset` are exposed; a real lexical persistent REPL with `await`; cua/app objects, AX diffs, rich screenshots and OCR; an independent cursor that moves continuously without taking over the system pointer; cleanup on window movement, resize invalidation, cancellation, reset and exit. 25 regressions, real documents and lifecycle, and pi completing 7 real event operations in 9 js calls all passed.

The first new-release human round on the input-method/case issue is still recorded as a failure. Cursor animation now runs before the app-local focus notice; in the corrected 10-second idle / 20-second background comparison the participant reported "both phases normal, no obvious difference". That round did not read drafts, so character-level integrity is not proven automatically and the cause remains an inference. Repeating ordinary short-phrase tests is unnecessary.

Final delivery must be judged by out-of-repository acceptance of the actual 1.0.0 ZIP and source tar.gz; stable report paths and release gates are in [VALIDATION.md](VALIDATION.md) and [validation-index.json](validation-index.json). The tag is created only after all of those checks pass. This file records functional checkpoints and does not substitute an old rc package or v0.3 evidence for final-package acceptance.

Legacy 17-tool tests are redirected to the new interface or are explicitly retired before execution; the historical implementations remain visible in Git. Commits are functional and the tags are local; nothing is published outside this repository.

Scope: one machine running macOS 26.6.2 arm64 with a single physical Retina display; real multi-display and arbitrary application/OS compatibility are not verified. Normal TCC, independent implementation, no credential extraction, no distribution of proprietary code, and no modification or injection of the original app.
