# v1.1 compatibility improvements and measurements

[中文版本](zh-CN/COMPATIBILITY_V1_1.md)

This round implements the original's coordinate handling, modifier keys/hold durations, scroll distance and restart reconnection. It is still an independent MCP server that exposes only `js`/`js_reset`, introduces no original runtime, and connects to no private socket. The existing v1.0.0 tag is not moved.

## Coordinates

`cua.getApp(reference,{coordinateMode:'original'})` keeps screenshot-pixel array mapping, so AX-only and automatic action read-back no longer switch back to logical points; the default `adaptive` mode keeps the v1.0 rule. The first `original` AX-only capture silently measures the actual screenshot scale and re-measures when the size changes; without permission or without a measurable scale it errors instead of guessing a 2× ratio.

Every full or diff AX result carries `coordinates`: unit, scaleX/Y, top-left origin, valid range (upper bound exclusive) and `axFrameUnit`. AX/OCR rectangles always use logical points. `getCoordinateInfo()` reads the current mapping; `getAXStateAndScreenshot()` also returns `coordinates`. A live multi-select test in `original` mode clicked different pixel positions across several automatic AX read-backs, proving the mapping did not revert to logical points. The real reconnection test used `maxDimension:640` (a scale of 1 rather than a fixed 2), and the new object kept pixel units with a 640-wide range.

## Modifiers, durations and cancellation

`click`'s `key` accepts super/cmd/command/meta, shift, ctrl/control and alt/option (joined with `+`); `click`/`pressKey` accept `durationMs` 0..5000, and specifying it explicitly forces background events. An explicit `ax` strategy rejects modifier or held clicks. No global modifier events are generated and system auto-repeat is not simulated.

Routing still matches only this helper's source PID, the per-operation nonce and the target PID/window. The caller-requested flags are now retained per packet: a temporary Command is removed while a genuinely requested Command is kept. Activation-point preparation clicks still carry no caller modifiers, so Shift/Command is never applied to a title bar by accident. Key-up timestamps are generated at release. Reset/cancel attempt to release toward the original target; a hard kill or a vanished target cannot guarantee reception.

A real AppKit NSTableView selected row 0 with a plain click, rows [0,1,2] with a Shift click on row 2, and rows [0,2] with a Command click on row 1 — not merely asserting that the send function returned no error. The receive queue recorded real down/up and modifier flags, and key tests cross-checked NSEvent timestamp differences. NSTableView's tracking loop consumes mouse-up directly, so the harness logger records in the `nextEvent` queue instead of relying on the local monitor alone. Reset interrupted a 5-second keyboard hold and a 5-second mouse hold separately and confirmed the matching releases arrived.

These are target-event/recipient results and sampling checks, not a new human IME acceptance. The optional experimental AppKit notices cover the requested hold interval, so long holds are not extrapolated into concurrent-use compatibility with arbitrary applications or input methods.

## Scroll measurements and the trade-off

Two **owned applications** were used: an AppKit NSScrollView with a large self-drawn canvas, and a WKWebView with a local HTML container (no network page). Window sizes were 420×360 and 900×700; content viewport heights were 328 and 668; scrolling started at x/y=2000 to avoid edges. Each application's real content offset was read back, covering single, three consecutive, reverse and horizontal input. Original input was sent only through legitimate `cua_repl`; the controller only arranged/observed its own fixtures.

| Operation | Original AppKit / WebKit | Independent v1.0 | Independent v1.1 |
| --- | --- | --- | --- |
| height 360, down 0.6 page | 216 | 173 | 216 |
| height 360, three × 0.6 page | 648 | 519 | 648 |
| height 360, up 0.3 page | -108 | -86 | -108 |
| height 700, down 0.6 page | 420 | 336 | 420 |
| height 700, three × 0.6 page | 1260 | 1008 | 1260 |
| height 700, up 0.3 page | -210 | -168 | -210 |

The vertical results support using the **total window height × pages**, not the content viewport height. v1.1 defaults to `round(height*pages)`; `scroll(target,direction,pages,{distanceMode:'legacy'})` keeps the 0.8 coefficient. Integer samples cannot prove the original's rounding rule for every fractional case; at most a plausible single-point rounding difference is allowed. The returned `scrollDistance` states the actual logical-point delta sent, and the application may still clamp or ignore it.

The original produced no observed horizontal displacement in this round for either application or size; one AppKit large-window leftward attempt also reported noWindowsAvailable, and that error is stored separately rather than counting 0 as success. The independent build does produce 202/-101 points (width 420) and 432/-216 points (width 900). Horizontal therefore keeps `round(width*0.8*pages)`, does not claim original compatibility, and does not replicate the zero displacement.

To explain the horizontal anomaly, a bounded static analysis was done on the current hash `ef4f4d…`: `SynthesizedEvent.scroll` enters at 0x10075dd54, sets the wheelCount argument to 1 at 0x10075dde4, then calls the named wrapper at 0x1002611ac. The wrapper keeps six arguments and jumps to a lazily resolved function pointer; this round did not go on to prove the pointer's runtime destination. The corresponding Apple SDK interface needs wheelCount=2 for the second axis. A local probe that **only constructs and never posts** events also shows wheel2=-252 for both, axis2=0 with wheelCount=1, and axis2=-252 with wheelCount=2. That is a static explanation consistent with the symptom, not a captured full original dynamic call chain. No decompiled code is distributed.

## Isolation and failure records

The independent build's full 20-case matrix (12 vertical, 8 horizontal) checked the recipient offset item by item and passed pre/post coverage and nonactivation checks throughout. The original's 10 WebKit observations also completed, but horizontal showed no displacement. An earlier complete vertical set on the original AppKit had normal coverage records, yet a later retest raised the target above the cover window even though active/key remained false. This round keeps the raise trace and stops that retest rather than restoring the foreground/stacking to hide the result.

Also retained: the original controller completing 0 groups because of non-interactive stdin, the initial large-window coverage failure, the original AppKit `noWindowsAvailable`, and the independent cursor stopping with WINDOW_MOVED while approaching. The newer fixture observes geometry stability before acting and its own calibration window can display across Spaces; that is test arrangement only, and the product still requires the target on the current unlocked desktop, so no cross-Space guarantee is extended. Native move/focus checks were not relaxed, and failed actions were not blindly retried.

The first reconnection test wrongly assumed a single CG window when a hidden helper window also existed; it now explicitly selects the observed PID/window. The API always listed candidates and never auto-selected the first. The build-protection test now uses a ready handshake from an owned signed process; the earlier problem of a copied `/bin/sleep` process being SIGKILLed early is retained with an unconfirmed cause.

## Reproduce

```sh
npm test
npm run test:input-options
npm run test:reconnect
npm run test:scroll
# legacy distance algorithm (also checked item by item against real offsets)
node scripts/scroll-calibration-test.mjs --independent --legacy
# original read-only controller operating the owned bundle printed by a normal cua_repl session
node scripts/scroll-calibration-test.mjs --webkit-only
```

Original controller stdin: `prepare` carries flavor and size; after each original input and observation completes, send a checkpoint (direction/pages/count, may record an error); `finish` checks the whole matrix and fails if a group is missing. Each size runs down/0.6/1, down/0.6/3, up/0.3/1, right/0.6/1, left/0.3/1. Unexecuted items or a 0 offset after an exception cannot count as success. The isolation fields are before/after and application-sampled state, not a gapless hardware proof. This round added no new third-party application, multi-display, long-running or human long-hold acceptance.

Machine results and the trimmed distributable list are in [compatibility-v1.1.json](compatibility-v1.1.json).
