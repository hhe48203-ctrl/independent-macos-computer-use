# Local verification results

[中文版本](zh-CN/VALIDATION_V03.md)

## v0.3 current acceptance

2026-10-18: real documents, pi, stock Calculator/TextEdit operations and one human concurrent-use test passed. Encoding edges were verified through direct MCP; pi verified ordinary Chinese/emoji plus every action. 18 automated tests and 11 default quiet checks passed. Everything used normal local TCC. Scope, sampling gaps and historical failures are in the [release notes](RELEASE_NOTES.md), the [background record](FOCUS_FIDELITY.md) and `validation-index.json`. Visible arrangement of stock apps does not count as a background capability.

## The v0.1/v0.2 records below are retained as history

2026-10-17, America/Edmonton. This machine runs macOS 26.6.2 (25G83), arm64, Node.js 24.15.0 and pi 1.2.0. Tests ran in a launch context that already had normal TCC. Another client or machine needs its own authorization; these results cannot be extrapolated to all apps or OS versions.

| Verification | Actual result |
| --- | --- |
| `npm test` | 11 passed: argument/target boundaries, image structure, serial transport, native errors, cancellation, timeout, startup-failure recovery, symlinked entry point and real MCP schema discovery |
| Foreground regression (v0.1) | 21 real desktop checks passed; v0.2 keeps it as an explicitly enabled test and it was not run again after the user reported interference |
| `npm run test:pi` | passed; pi completed Chinese input, button operation and re-observation through native MCP tools |
| Calculator | real SwiftUI app, AX button computation of `7 × 8`, AX value and screenshot confirmed `56` |
| Original CUA comparison | normal `cua.getApp` bound the owned fixture and received an AX diff after click/type |
| Prebuilt plugin package | unzipped from the ZIP into a separate `/tmp` directory; 17-tool discovery and a native status call passed without the checkout's node_modules |
| Local configuration | `.pi/mcp.json` gained a project-level server; global pi/Codex configuration was untouched |

The 21 desktop checks in v0.1 covered: MCP initialization and 17-tool discovery, TCC status, real window enumeration, combined PNG and AX observation, secure-field masking, Chinese/emoji input, CMD+A replacement, AX press, element click, coordinate click, AX setValue, real drag, real scroll, local OCR, rejection of out-of-range/unknown IDs/secure input/default clipboard/unauthorized apps/full-screen capture, an empty allowlist rejecting everything, releasing the mouse after a cancelled drag, bounded-tree truncation, menu-bar observation, UTF-16 text disambiguation and replacement, and app menu operation excluding the system Apple menu.

The v0.1 pi run recorded 7 MCP calls: status → windows → snapshot → ax_action(focus) → type_text → ax_action(press) → snapshot. The test app's own state was:

```json
{
  "input": "pi desktop verified 中文",
  "result": "Result: pi desktop verified 中文 [1]",
  "count": 1
}
```

That simultaneously verifies agent tool choice, MCP arguments, Node→Swift communication, real AppKit input and an observable result. The test disabled pi's built-in file/shell tools, other extensions and other MCP tools, keeping only built-in MCP support and this server. No result was faked by editing the fixture's state file.

Raw local evidence is stored in `artifacts/desktop-test-report.json`, `pi-test-report.json`, `calculator-test-report.json`, the fixture PNG, the Calculator PNG and pi JSONL events. None of it enters the plugin or source packages. `docs/evidence-manifest.json` contains only the investigated objects' identity, hashes, REA metadata and limits, never original source code.

The first pi test showed that `--no-extensions` also disabled pi's built-in MCP, leaving the model no callable tools; adding `--extension builtin:mcp` made it pass. The first fixture shortcut check failed because the test app had no standard Select All menu; adding the AppKit menu fixed it. REA's Wakaru source recovery was unavailable and is recorded honestly in the investigation document; static graphs and Mach-O analysis were actually completed.

After the prebuilt ZIP was really moved to `/tmp`, testing also found that macOS `/tmp`→`/private/tmp` path normalization broke the entry-point check. The entry point now compares realpaths, and a regression that starts it through a symlink and runs MCP initialize/tools/list was added; external extraction verification then passed.

Not tested: Intel Macs, macOS 14/15, real multiple displays, all Electron/browser apps, long-running operation, complex IME composition, lock screen/background separate desktops, every timing of a user actively taking focus, and the interactive TCC-authorization path when the system denies it. The denial branch is implemented from public API return values; local permissions were not modified to force a denial. Cancellation can release an in-progress drag, but a hard kill of a blocked process offers no transactional guarantee.

## v0.2 background acceptance (second round)

Full report: [background-1792223272595/report.json](../artifacts/background-1792223272595/report.json). This is the standard-MCP measurement after the internal activation notices were removed; it used macOS's own TextEdit and Calculator plus an independent AppKit fixture.

- With the target fully covered, its AX, PNG and Vision OCR content were correct.
- Background Unicode insertion, UTF-16 selection replacement and real NSScrollView/document scrolling read-backs passed for both AppKit and TextEdit.
- TextEdit CMD+A went through AXSelectedTextRange and was verified; reliable delivery of raw shortcuts is not claimed.
- The Calculator AX button loop computed 7×8=56 with the target fully covered by TextEdit before and after every step.
- Foreground TextEdit actually received all 177 planned characters in an 8.028-second protected HID trace, character for character identical; meanwhile the background repeatedly operated Calculator and edited another target app.
- Throughout sampling the foreground PID stayed the foreground TextEdit, the pointer only landed where the driver planned, and Calculator never activated.
- In the same run, a custom-view drag delivery passed; a raw mouse click triggered BACKGROUND_WINDOW_REORDERED, a recorded isolation failure that is not counted as a pass. The default AXPress button click passed.

The synthetic input used by the test is not human input. Human concurrent use has its own human-report.json, and claiming a human experience pass requires participant feedback. Raw mouse event app support remains limited; foreground restoration or ignoring failures was never used to force an "all passed".

The second human round lasted 31.718 seconds, 60 background AX button actions completed 12 calculations, and 3080 samples saw no target foreground activation. The participant replied "I typed and moved the mouse, usage was normal". However neither sampling nor action boundaries captured pointer movement, so timing/session overlap cannot be independently confirmed by instrumentation, and this round cannot be described as a measured interference-free human pointer trace. human-report.json and the untouched idle record from the previous round are retained, and final feedback is kept separate from measurement evidence.

## Final default background route: after fixing the test's window stealing

The [final quiet report](../artifacts/background-safe-1792223945398/report.json) contains 13 passed checks and 29 real MCP operations. Native `foregroundEnabled=false`; owned accessory windows were ordered back and relatively ordered with no activate, no `cu_focus` and no global input. The foreground was Codex PID 60201 at start, at end and in continuous sampling.

Reusing still-live test windows without launching, focusing or rearranging stock apps: Calculator stayed fully covered under the old TextEdit and the AX button computed 56; the old owned TextEdit document stayed fully covered under the current Codex window and AX replacement of 110 lines of test text, Chinese/emoji replacement, directed scrolling and scrollbar read-back all passed. No user window layout was changed to achieve coverage.

Supplementary human confirmation: typing in the Codex input field on the same Mac produced intact text. The user later reported that TextEdit and the Background Automation windows had come to the front; that matches the foreground arrangement of the original interactive test, but without per-event human feedback timing it cannot be ruled out that the recorded raw-event raise problem occurred. The correction is that the native layer now denies every foreground request by default, rejects unknown modes, and interactive tests must be enabled explicitly; default tests use nonactivating arrangement. The latest 13 passes only represent this corrected route, and raw mouse/generic shortcuts are not thereby upgraded to full compatibility.

Final v0.2 pi pass: 7 tool attempts, one of which sent `cu_click` with pid/windowId and an element reference together and was rejected by the schema; the model removed the extra target argument and succeeded. The real result was `Result: pi desktop verified 中文 [1]` with active=false and key=false. Coverage was complete before and after, the foreground was Codex throughout, 2390 samples saw no target foreground activation, and `cu_focus` was never called. The pi report and an MCP call summary with model/session text removed go into the evidence package. 11 automated tests passed; the prebuilt ZIP was extracted outside the repository and verified 17 tools, the native 0.2.0 backend and the default FOREGROUND_DISABLED rejection.

The prebuilt package does more than pass `status`: `scripts/packaged-background-test.mjs` extracts the actual ZIP into a temporary directory outside the repository, drops NODE_PATH and the foreground switch, and a standard MCP client uses that package to press 5 Calculator AX buttons in a row and confirm 56, with full coverage before and after and native `foregroundEnabled=false`. The report and screenshots go into the evidence package. The test launches, activates and rearranges no apps. Against still-live owned targets you can run `CU_TEST_EXISTING_TARGETS=/absolute/path/to/old-report.json npm run test:packaged-background`.
