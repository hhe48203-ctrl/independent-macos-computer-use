# Current checkpoint: 2026-10-22

[中文版本](zh-CN/DEVELOPMENT_STATUS.md)

This round refreshed the original reference baseline: App 26.1016.61520, cua-repl 0.1.2, sky 0.7.12, with the installed and bundled native service hashes matching. 9 of the original's 10 behaviors passed; exact Unicode appending failed. The independent build passed the same 10 checks, and the 25 existing regressions plus 5 new baseline-decision checks passed with no skips. The current text-to-virtual-key function was reverse engineered again, and the JPEG, post-AX pixel-coordinate and scroll-distance differences are now explicit. See [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md).

This round did not change the production runtime and did not move the v1.0.0 tag or the already-accepted release packages. There was no new human concurrent-use acceptance, so earlier human results cannot be renewed automatically. Original failures and harness corrections are retained.

Below is the original v1 delivery checkpoint.

---

# v1.0.0 delivery checkpoint (2026-10-19 UTC)

The functional and local human phase is complete: only `js`/`js_reset` are exposed; a real lexical persistent REPL with `await`; cua/app objects, AX diffs, rich screenshots and OCR; an independent cursor that moves continuously without taking over the system pointer; cleanup on window movement, resize invalidation, cancellation, reset and exit. 25 regressions, real documents and lifecycle, and pi completing 7 real event operations in 9 js calls all passed.

The first new-release human round on the input-method/case issue is still recorded as a failure. Cursor animation now runs before the app-local focus notice; in the corrected 10-second idle / 20-second background comparison the participant reported "both phases normal, no obvious difference". That round did not read drafts, so character-level integrity is not proven automatically and the cause remains an inference. Repeating ordinary short-phrase tests is unnecessary.

Final delivery must be judged by out-of-repository acceptance of the actual 1.0.0 ZIP and source tar.gz; stable report paths and release gates are in [VALIDATION.md](VALIDATION.md) and [validation-index.json](validation-index.json). The tag is created only after all of those checks pass. This file records functional checkpoints and does not substitute an old rc package or v0.3 evidence for final-package acceptance.

Legacy 17-tool tests are redirected to the new interface or are explicitly retired before execution; the historical implementations remain visible in Git. Commits are functional, the final tag is local v1.0.0, and nothing is pushed or published publicly by default.

Scope: one machine running macOS 26.6.2 arm64 with a single physical Retina display; real multi-display and arbitrary application/OS compatibility are not verified. Normal TCC, independent implementation, no credential extraction, no distribution of proprietary code, and no modification or injection of the original app.
