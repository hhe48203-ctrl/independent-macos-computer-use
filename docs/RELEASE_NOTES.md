# v1.3.0 — target-aware cursor visibility

[中文版本](zh-CN/RELEASE_NOTES.md)

The cursor now respects the target window's exposed area by default: a covered anchor hides the glyph and an occluding edge clips it, while motion, clicks, drags, scrolling and typing continue normally. Occlusion alone never cancels an action. `CU_AGENT_CURSOR_VISIBILITY=always` restores the earlier top-level overlay, and the setting is independent of `CU_AGENT_CURSOR_STYLE`. Geometry is sampled from the public window inventory at about 60 Hz, so moving a cover reveals or hides a stationary cursor without a new action.

Acceptance: 51 regression checks with no skips, plus live fully covered operations and an extracted-ZIP run; pixel behavior at 1× and 2× is verified offscreen for both styles and their glow, including empty and partial clips and multiple occluders. A visible, partially clipped live-window screenshot comparison is **not** claimed, and no new human IME acceptance belongs to this drawing-only change. Limits in [CURSOR_OCCLUSION.md](CURSOR_OCCLUSION.md); index in [validation-index-v1.3.json](validation-index-v1.3.json).

---

# v1.2.0 — cooperative input profile

[中文版本](zh-CN/RELEASE_NOTES.md)

Synthetic AppKit activation is no longer part of the default configuration: `setup-pi.mjs` now separates real event delivery from the experimental activation route, and only `--experimental-appkit-focus` opts back in. Concurrent use prefers verified AX text insertion, `pressKey('CMD+A')`, `selectText(...)` and ordinary `click(index)`; inactive AppKit apps can ignore some raw menu shortcuts and text-selection drags, and those attempts stay recorded as failures rather than being retried with activation.

Acceptance: 49 regression checks with no skips, a packaged five-scenario gate, and a new single-participant cooperative comparison (10.001 s idle, 20.551 s active, 30 operations, zero synthetic activation sessions) that the participant accepted; no input-source/case difficulty or window raising was reported. That is not an exact foreground-character acceptance and does not prove the unique historical IME cause or the original AX Raise branch. See [INPUT_ISOLATION.md](INPUT_ISOLATION.md) and [validation-index-v1.2.json](validation-index-v1.2.json).

---

# v1.1.0 — original coordinate, modifier and scroll compatibility

[中文版本](zh-CN/RELEASE_NOTES.md)

Adds the original screenshot-pixel coordinate mode, real modifier-key multi-select and 0..5000 ms key/button holds with release on cancellation, calibrated vertical scrolling, and explicit restart reconnection. Defaults are unchanged: `adaptive` coordinates, strict PID/window binding, and `legacy` still restores the older 0.8 scroll coefficient.

Acceptance: 39 regression checks with no skips, 20 scroll cases matching real offsets, packaged and source-archive runs of document, modifier/hold/cancel and reconnect scenarios. Horizontal scrolling is still not claimed compatible, and no new human long-hold acceptance was added. See [COMPATIBILITY_V1_1.md](COMPATIBILITY_V1_1.md) and [validation-index-v1.1.json](validation-index-v1.1.json).

---

# v1.0.0 — cua REPL and a continuous independent cursor

The public MCP interface moved from 17 `cu_*` tools to `js`/`js_reset`; existing clients must migrate (scripts and syntax in JS_API.md). Top-level `await`, `var`/`let`/`const` and app objects are genuinely preserved, AX diffs and rich screenshots are emitted automatically, and timeout/cancel/reset have bounded cleanup.

The independent native cursor was drawn from the reference image as a light outline, translucent small arrow and soft glow (a later default change switched it to an amber ring reticle so it cannot be confused with Codex's own pointer; `CU_AGENT_CURSOR_STYLE=arrow` restores the old look). It eases in and out at about 60 Hz, operations wait for arrival, and real drag packets drive progress; it is click-through, can never become key/main, never moves the system pointer, follows window movement, and is cleaned up on resize invalidation, cancellation, reset and target exit.

Local verification: 25 regressions; pi completing real shortcuts, Chinese/emoji, selection drag, scrolling and raw clicks in only 9 js calls; real desktop and lifecycle tests; a 10-second idle / 20-second background human comparison. The failing round's input-method/case-switch difficulty is retained. After moving the animation relative to the app-local AppKit focus notice, 29 real background operations coexisted with 43 human Codex keyDowns and the participant reported both phases as normal. Timing overlap is the inferred cause; a single comparison does not prove compatibility with any input method or application.

Sources and prebuilt packages run independently and contain no original modules, binaries or image assets, and need no Codex, original service or key. Normal macOS TCC is still required. Only one macOS 26.6.2 arm64 machine with a single physical Retina display was tested; the raw event path uses a system SPI, and the app-local AppKit focus route is off by default and limited to the verified OS. Browser APIs, rich-text paste, modifier-key clicks and hold durations are not implemented and fail explicitly. Ordinary screenshots exclude the independent cursor.

The v0.3 public interface is retired; the rest is historical release notes.

---

# v0.3.0 — independent background real input

Node MCP stdio and an independent Swift helper, 17 tools; the runtime needs no Codex, no original Sky service, no private socket and no API key. Sources and the prebuilt arm64 package contain only the independent implementation plus dependencies with listed licenses.

## Choosing how to run

By default the verified AX text/button paths plus independent screenshots, OCR and directed events are kept, and foreground control is not allowed. Real text uses `cu_type_text strategy:"event"`, real keys use `cu_key strategy:"event"`, and real single clicks use `cu_click strategy:"event"`; the service never silently swaps them for AX or foreground operations.

`cu_launch` returns the single existing instance by default; starting a new app requires an explicit `allowVisibleWindows:true` accepting a visible arrangement. `activates=false` cannot guarantee a new window will not raise. With multiple instances, select a PID first; the service does not blindly reopen one of them.

On the **macOS 26.6.2 arm64** verified in this round, the app-local AppKit focus route can be enabled explicitly to improve real control handling in unactivated windows:

```sh
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node /absolute/path/to/macos-computer-use-mcp/src/server.mjs
```

MCP clients can follow `examples/mcp-background-events.json` and put that variable in the server's `env`. For a source checkout, install pi with `node scripts/setup-pi.mjs --background-events`; it only updates project-local configuration, keeps existing server environment settings, and does not touch global configuration or credentials. This machine's project is configured that way. The default plugin manifest does not enable the experimental route.

## Verified scope

| Path | Actual evidence |
| --- | --- |
| Fully occluded owned AppKit document | real Unicode (Chinese, emoji, NFD, ZWJ, newline), navigation keys, CMD+A, click, drag selection and scroll, all read back exactly |
| pi → standard MCP → independent helper | 16 tool calls, 7 real operations, 0 tool errors; ordinary Chinese/emoji text exact. Encoding edges are verified separately by direct MCP tests |
| Human foreground concurrent use | 133 real background operations; the foreground kept all 15 characters, 32 keyDown and 32 keyUp receptions, and 1759 pointer positions; the user confirmed manual edits/backspaces. Window and focus sampling saw no target raise/focus |
| System Calculator | 5 real button clicks, 7×8=56; fully occluded during the operations |
| System TextEdit | exact real Unicode append, click, drag-selecting 30 UTF-16 units, scroll; fully occluded during the operations |
| Default mode and regressions | 11 quiet desktop checks and 18 unit/transport/native checks, including cancellation, timeout, Unicode packetization, the event recorder and the running-executable overwrite guard |
| Actual deliverables | the ZIP runs screenshots, OCR and 7 real document operations outside the repository; the source tar installs locked dependencies outside the repository, rebuilds the helper, and passes 18 checks with no skips |

**Visible arrangement of stock apps is measured separately**: windows created for this task may appear briefly and are then returned to the previous foreground with normal system APIs. Background acceptance starts after the arrangement completes; the MCP background implementation does not depend on restoring the foreground afterwards.

Historical tests really did raise windows, drop characters on long input, have unconfirmed human observation, and hit harness bugs. They are retained and were not rewritten into successes. The new evidence index is `validation-index.json`; mechanisms and corrections are in `FOCUS_FIDELITY.md`.

Reproducing the deliverable checks: run `npm run package`, then `CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/packaged-document-test.mjs` and `node scripts/source-package-test.mjs`. The latter tries an offline cache first, and when needed reaches the public registry through an isolated npm configuration with install scripts disabled, without reading the user's npm auth configuration. Human input happens separately with an arranged participant; automated acceptance never simulates participant input.

## Limits

The experimental route is off by default and refuses to package for an unverified OS/architecture. The minimum build target is macOS 14.4; other OS versions, Intel and multiple displays are not machine-verified. It uses a dynamically resolved system SPI, so future OS updates and arbitrary applications are not guaranteed.

The original ViewBridge focus-suppression/keystroke-rerouting state machine is not ported, and this does not freeze the screen, inject into processes, alter TCC, suppress other people's hardware events, or reclaim focus after acting. Sampling has gaps; one human pass does not mean every transient timing is interference-free. Applications may activate or raise themselves; that is detected, treated as a failure, and input stops rather than being resent automatically.

Normal Accessibility / Screen Recording authorization is still required. Hidden, minimized, other-Space, lock-screen and separate-desktop cases are outside the supported guarantees. Unicode is delivered as event payload; IME composition is not simulated.
