# v1.0.0 local acceptance

[中文版本](zh-CN/VALIDATION.md)

2026-10-19 UTC, macOS 26.6.2 (25G83), arm64, Node 24.15.0, pi 1.2.0, one physical Retina display. Normal Accessibility/Screen Recording authorization; new clients still need to authorize normally.

| Verification | Result and scope |
| --- | --- |
| Automated regressions | 25 passed, 0 skipped: real lexical bindings/TLA, error recovery, cancel/timeout/reset, stale-callback isolation, cross-VM images, MCP discovery, native policy and coordinate formulas |
| New public interface | only `js`/`js_reset`; persistent app objects, AX diffs, rich PNG, screenshot coordinate mapping, with explicit errors for window ambiguity and resize invalidation |
| Real documents | in a covered owned AppKit document, real Unicode (Chinese, emoji, NFD, ZWJ, newline), navigation keys, CMD+A, selection drag, scrolling and click all read back; SCK screenshots and Vision OCR pass |
| Visible cursor | continuous intermediate frames and screen crops checked; light translucent arrow with soft glow, which was the only style at the time (the default is now the amber ring reticle, added later). The final lifecycle test had 36 real drag packets, and window-follow, hide-on-resize, release-on-reset-during-drag and cleanup-on-target-exit passed with the system pointer unchanged |
| pi | only 9 js calls, 0 tool errors, reusing the app across calls, completing 7 real event operations and verifying document, selection, scrollbar and button results; a separate 5-call js test covers the basic Chinese input loop |
| Human concurrent-use comparison | 10.001 s idle and 20.159 s background, 29 real background actions; the participant confirmed "both phases normal, no obvious difference" |

In the human comparison, the Canadian/SCIM input source and Caps Lock/Globe switching were observed in both phases; 43 hardware keyDowns reached Codex during the background phase while the helper's 17 keyDowns were delivered only to the target. Codex drafts were not read, so **there is no character-level automatic integrity proof for this round**. Foreground/key metadata and human experience are measured separately, and a single person on a single machine is not extrapolated into compatibility with every IME or application.

The first new-release human round hit input-method/case-switch difficulty and is still recorded as a failure. Text/key cursor animation was then moved before the app-local AppKit focus notice so that hundreds of milliseconds of animation no longer occupy the local activation window; timing metrics and ordering assertions were added. Controlled diagnostics found no sustained global modifier state change, which does not prove the absence of a transient; animation timing is a possible cause, not a proven unique root cause. Failures, measurements and human review are all retained, and old reports were not rewritten.

## Independent verification of the deliverables

Authoritative results for the final packages live in the evidence package at `artifacts/release-verification-v1/`. The prebuilt acceptance extracts the **actual ZIP** to `/tmp` outside the repository, drops NODE_PATH, and performs the real document operations, PNG and OCR through that package's own worker/helper. The source acceptance extracts the **actual tar.gz** to another temporary directory, installs locked dependencies with an isolated npm configuration (install scripts disabled), rebuilds the native helper and runs all 25 tests requiring 0 skips.

The release gate requires `packaged-repl.json`, `packaged-document.json` and `source-package.json` in that directory to pass, and `release-gate.json` to confirm they match the final SHA-256. Candidate packages or old v0.3 records cannot substitute. Reproduce with:

```sh
npm run build
npm run package
node scripts/packaged-repl-test.mjs
node scripts/source-package-test.mjs
```

Packaged verification previously hit CG/AX window-coordinate disagreement, and on another attempt the target and cover windows shifted together during cursor motion; both failed explicitly and stopped without trying to follow the change or restore the layout. After creating new test windows, the same ZIP passed; the trigger is unconfirmed and the earlier results were not rewritten. A default desktop test also hit APP_GONE once with an undetermined cause, followed by a successful per-request diagnostic of the same native call path. Such errors require re-observation rather than automatic input retry. The records are stored with the final evidence as prior-attempt-failures.

The human test needs a coordinated start time and is not repeated in automated release checks. Native real-event tests explicitly enable the machine-limited experimental app-local focus route, which is off by default. Default AX paths, visible arrangement, real events and human judgment cannot substitute for one another.

The current index is [validation-index.json](validation-index.json); research and architecture are in [REPL_CURSOR_RESEARCH.md](REPL_CURSOR_RESEARCH.md) and [JS_API.md](JS_API.md). The [v0.3 validation record](VALIDATION_V03.md) and its index are historical evidence, and the old 17-tool interface is retired.

## Not covered

Intel, other macOS versions, real multi-display, arbitrary Electron/browsers, complex IME composition, lock screen and other Spaces, and long-running operation are not machine-verified. Multi-display coordinate-formula tests are not a substitute for multi-display testing. Raw background events use a system SPI, so applications may ignore them or raise themselves; isolation errors stop the operation instead of restoring the foreground or filtering human events to hide the problem. Sampling gaps also cannot prove every instant is interference-free.

The evidence ZIP contains only owned test UI, results and necessary input/focus metadata; it excludes foreground draft screenshots, original proprietary code, research slices and credentials.

## v1.1.0 incremental acceptance

v1.0 records and the tag stay in place; the environment is still the same Mac with one physical Retina display. This round adds the original pixel-coordinate mode, real modifier-key multi-select and 0..5000 ms key/button holds, release on cancellation, and explicit restart reconnection. 39 regressions pass with 0 skips. The independent build's 20 scroll cases across AppKit/WebKit × two window sizes each match the real offset, and 12 vertical displacements agree with the values measured on the original. The default coordinate mode remains adaptive and default binding remains strict; vertical distance was adjusted and `legacy` restores the old coefficient.

The new deliverable verification was extended to extract the actual ZIP and run three full MCP cases — document, modifier/hold/cancel, restart reconnection — while the source package is reinstalled, compiled and tested outside the repository. The version-specific index and final-package gate are in [validation-index-v1.1.json](validation-index-v1.1.json); implementation, sample tables and original failure traces are in [COMPATIBILITY_V1_1.md](COMPATIBILITY_V1_1.md).

This round added no new human long-hold/IME concurrent acceptance. Horizontal compatibility is still not claimed; the original's zero horizontal displacement, the AppKit raise and the independent build's stop on geometry change are all retained, and later passes cannot overwrite earlier failures.

## v1.2 input-isolation investigation

[Input isolation](INPUT_ISOLATION.md) records the new owned-app causal traces and the original AX Raise receiver stack. The independent cooperative profile uses no synthetic AppKit activation; semantic equivalents cover inactive AppKit shortcuts/text selection. Full raw input remains explicitly experimental. The local pi configuration has been migrated, and a real pi run completed all seven requested operations in14 js calls with0 tool errors and3 distinct recipient key-down events.

49 regression checks pass with0 skipped, including atomic cross-process GUI ownership, leased-build refusal and pi policy migration. The final ZIP acceptance covers five scenarios: explicit experimental raw document input, cooperative document input, modifier/hold cancellation, strict reconnect and instrumented regular-AppKit no-activation tracing. The source archive is rebuilt/tested outside the checkout. [validation-index-v1.2.json](validation-index-v1.2.json) records the version-specific gate. A new single-participant cooperative comparison (10.001s idle,20.551s active,30 operations,zero synthetic activation sessions) was accepted as resolved, with no reported input-source/case difficulty or window raising. It is not an exact foreground-character or experimental-long-hold acceptance. The exact original Raise branch and unique historical IME cause remain unproven.
