# JavaScript API

[中文版本](zh-CN/JS_API.md)

The agent sees only two MCP tools; the 17 legacy `cu_*` tools have been removed from the public service. Native JSONL methods are an implementation detail and are not public MCP calls.

| Entry | Parameters | Behavior |
|---|---|---|
| js | code:string, timeout_ms?:100..120000 (default 30000), title?:string | evaluates in the persistent Node REPL and returns ordered text and image blocks |
| js_reset | {} | stops JS and native input and clears lexical variables/app objects/cursor |

`cua`, `nodeRepl` and `console` are available up front. Real `var`/`let`/`const` and top-level `await` are supported; redeclaring an existing `let`/`const` raises a SyntaxError, while ordinary sync/async errors keep bindings. A timeout, cancellation, process exit or a memory/output limit rebuilds the session. Output is capped at 8 MiB or 256 blocks. Console/Worker stdout never enters the MCP protocol stdout.

Every desktop operation should be awaited. Native requests already issued are cleaned up before returning; an old asynchronous callback that fires after completion cannot issue operations in the next call. Reset cannot recall input that was already delivered. Code runs in a trusted local Node process with no security sandbox, so never run JS supplied by an untrusted web page.

## Selecting and observing

```js
await cua.getState(); // apps/windows/status; displayed automatically
let app=await cua.getApp('com.apple.calculator');
// or bind exactly from a real listing:
let other=await cua.getApp({pid:123,windowId:456});
await app.getAXState();
await app.getScreenshot();
await app.getAXStateAndScreenshot();
```

`getApp(reference,{coordinateMode:"adaptive"|"original",maxDimension:1600})` sends the app API documentation and the full initial AX tree. It does not launch a missing app and does not pick one of several windows automatically. `listApps`/`listWindows`/`status` can be called separately and accept `emit:false`. `rewriteDocumentation` re-displays documentation already emitted in this session. `launchApp(bundleId,{allowVisibleWindows:true})` is an extension that explicitly permits a visible launch window. `requestPermissions` only triggers the normal macOS settings flow and must respect the user's permission choices.

`getAXState` returns text and subsequent calls emit a diff against tree-line indices by default; `disableDiffing:true` returns the full tree. Indices refer to the latest observation and are not stable identities across observations. AX can be truncated, and text values are currently capped at 4000 characters; snapshots expire after 120 seconds and at most 16 are kept natively. A missing subtree is not proof the element does not exist. If the automatic observation after an action fails, a notice is shown but the completed action is not retried.

`getAXState` and `getAXStateAndScreenshot` accept `maxNodes` (1–2000, default 500) and `maxDepth` (1–30, default 16) for a single observation. Use `emit:false` to filter the returned text before displaying relevant lines from a large tree.

`getScreenshot` returns a PNG Buffer, and `getAXStateAndScreenshot` returns `{state,coordinates,screenshot?}`. Both display as MCP image blocks by default; `emit:false` only returns them. `nodeRepl.write(value)` emits text and `nodeRepl.emitImage(PNG or JPEG bytes)` emits an image. Ending a call with `undefined` avoids a redundant value inspection.

An ordinary window screenshot captures the bound window alone. A separate child window can otherwise expand the captured image and invalidate its coordinate scale. Bind a separate dialog by its own PID and window ID when it appears in `listWindows`. The explicit hover capture can include owned transient windows within the bound frame.

## Coordinates and actions

AX node frames and OCR rectangles are always logical points inside the window with a top-left origin. Every full or diff AX result carries a `Coordinates` JSON value: `unit`, `scaleX/Y` (pixels per logical point), `range` (upper bound exclusive), `origin` and `axFrameUnit`. `getCoordinateInfo({emit:false})` returns the current mapping; after a size change the old mapping is rejected. Never add screen offsets yourself or scale twice.

The default `coordinateMode:"adaptive"` keeps v1.0 behavior: arrays after a screenshot are screenshot pixels, while AX-only observations (including automatic post-action reads) return to logical points. When porting original scripts, opt in explicitly:

```js
let app=await cua.getApp({pid:123,windowId:456},{coordinateMode:'original'});
await app.getAXState(); // arrays stay in screenshot pixels instead of reverting
let coordinates=await app.getCoordinateInfo({emit:false});
```

In `original` mode the first AX-only call silently captures the window to measure the real scale without emitting a hidden image; later AX calls keep that screenshot mapping. The scale cap defaults to 1600 and can be set to 320..4096 in `getApp` or a screenshot. Re-observing after a resize re-measures; if no scale can be measured it raises `COORDINATES_UNAVAILABLE` rather than guessing or falling back to logical points. `original` mode therefore requires normal screen-recording authorization; it is a coordinate compatibility mode and does not mean every other original behavior is identical.

App objects bind strictly to PID/window by default and do not follow a restart:

```js
let preview=await app.reconnect(); // lists only candidates with the same bundle ID, install path and their windows
// inspect the list and choose a window explicitly; these PID/ID values are examples
let replacement=await app.reconnect({pid:789,windowId:1011});
```

A confirmed call returns a **new object plus a full initial AX observation**, inheriting the coordinate mode and screenshot-size setting, but not the old references/diffs/mapping. The old object stays invalid. Candidates can include hidden helper windows, so check title, size and visibility; never default to the first entry. Missing identity or an unmatched candidate is rejected, and the API never implicitly launches the app.

| Method | Description |
|---|---|
| click(index or [x,y], options?) | mouseButton, clickCount, strategy:auto/ax/event/appkit, key, durationMs; plain clicks prefer AXPress |
| typeText(text,{strategy?,target?}) | verified AX insertion or real process-directed Unicode. Optional target is the current editable AX index in this bound window |
| pressKey('CMD+A',{strategy?,durationMs?}) | auto may use AX selection; event forces real key packets |
| drag(from,to,{duration?}) | duration 0.1..2 s, default 0.4; background real events |
| scroll(index or point,direction,pages?,{distanceMode?}) | up/down/left/right, pages default 1 with range >0..10; calibrated by default, legacy optional |
| selectText(index,text,{prefix?,suffix?,selectionType?}) | text/cursor_before/cursor_after with UTF-16 ranges |
| setValue(index,text) | semantic AXValue set, with string readback when available |
| performSecondaryAction(index,action) | focus/press/showMenu/increment/decrement/confirm |
| paste(text,{format:'text'}) | plain-text AX insertion, no clipboard |
| ocr({emit?,maxDimension?}) | local Vision OCR; rectangles are logical points in the window |
| move([x,y]) | moves only the independent overlay cursor, produces no mouse input |
| hover([x,y],{durationMs?,screenshot?}) | explicit foreground hover with the real pointer |

Plain background element clicks use the table’s writable `AXSelectedRows` when the observed element is a row or its text and has no `AXPress`. `selectionOutcome:"dialogOpened"` means a sheet appeared. Read the new AX tree before choosing its buttons.

A plain background click on a static text label inside its direct button or checkbox parent can use the parent’s `AXPress`. The parent must contain the click point and still match after the cursor approaches. Use `strategy:'event'` to request pointer delivery explicitly.

`pressKey(key,{strategy:'appkit'})` explicitly requests experimental app-local focus preparation for one background press without a hold. Enable each target bundle at server startup in the comma-separated `CU_EXPERIMENTAL_APPKIT_KEY_BUNDLE_IDS`. The target must be inactive and match the app’s focused AX window. The experimental typing-route query currently requires macOS 26.6.2 on Apple silicon. Preparation uses a target-only activation-point click and can activate the app’s text input context. Use this route on a reserved desktop until concurrent human input is verified.

`click([x,y],{strategy:'appkit'})` uses the same experimental preparation for one plain background left click at a fresh coordinate. Enable target bundles separately with `CU_EXPERIMENTAL_APPKIT_CLICK_BUNDLE_IDS`. This strategy requires coordinates and rejects element indices, modifiers, multiple clicks and holds. Re-observe the target after clicking.

In an inactive window, `drag` returns `BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED` before sending pointer input when the start point resolves to a passive row of a native table with writable `AXSelectedRows`. AppKit drag tracking can take keyboard focus before the drag image appears. Use an exposed row-move control when the app provides one.

Modifier-click example: `await app.click([200,400],{key:'super+shift',durationMs:250})`. `key` accepts only cmd/command/meta/super, shift, ctrl/control and alt/option joined with `+`, and works with coordinates and the newest element index. A modifier or duration option forces background events, `strategy:'ax'` is rejected, and auto chooses event. A genuinely requested Command flag is preserved for the target; a Command added only for routing is removed when it was not requested.

`durationMs` for click/pressKey is 0..5000 ms and controls the interval between each down/up pair; an explicit key duration (including 0) disables the AX substitute for CMD+A. System auto-repeat is not simulated and no global modifier down/up events are generated. Cancellation, reset and target movement attempt to release held keys or buttons only toward the original target; app exit or a forced hard kill cannot guarantee reception. The experimental AppKit route's local notices cover the requested hold interval, and long holds have no new human IME concurrent-use acceptance.

The default vertical distance is calibrated to `round(windowHeight*pages)`, consistent with measurements on two owned apps, two sizes and consecutive scrolling. Horizontal keeps `round(windowWidth*0.8*pages)`: the original produced no horizontal displacement in this round, so no horizontal compatibility is claimed. The fourth parameter `{distanceMode:'legacy'}` restores the v1.0 0.8 algorithm on both axes. The returned `scrollDistance` gives the logical-point delta sent; the actual displacement is still up to the app. Full data is in the [compatibility acceptance](COMPATIBILITY_V1_1.md).

For a readable string `AXValue`, `setValue` reports `valueVerified` when the returned value exactly matches the request. If a requested change leaves the previous value in place, it reports `AX_VALUE_UNCHANGED`. Observe normalized or unreadable values before proceeding. Closed popups with read-only values, no children and only native menu actions report `BACKGROUND_POPUP_UNSUPPORTED` for background opens. Real events require app support. The `event` text strategy requires a pre-existing, readable, non-secure text focus and selection range.

In the tested Chrome address bar, `typeText` updated the displayed value without preparing the address for submission. For navigation, focus the current address field, call `setValue(index,address)`, press Enter, and verify the loaded page in a fresh observation.

Some Chromium web selects appear as `AXPopUpButton` and open a native menu. Use `performSecondaryAction(index,'focus')`, verify the control reports `focused:true`, then use `pressKey(key,{strategy:'event'})` with a printable key matching the intended option's unique prefix. Verify the selected value before committing the form. This path depends on the app's type-ahead behavior.

## Cursor and screenshots

`app.hover([x,y],{durationMs:1500,screenshot:true})` requires `CU_ENABLE_FOREGROUND=1` at server startup. It focuses the bound window and moves the system pointer. The dwell defaults to 1000 ms and accepts 0–5000 ms. The optional capture is cropped to the bound window on one display and includes overlapping transient windows from the same process. The image carries its own coordinate scale. If capture fails after hovering, the result includes `screenshotError`.

The cursor is an independent NSPanel that eases in and out at about 60 Hz between target positions, and real input waits for arrival. Drags show actual packet progress. It can never become key/main, is click-through and never moves the system pointer. Text and semantic actions point at an element center, not a measured insertion point.

Two styles are selected by `CU_AGENT_CURSOR_STYLE`; anchor, motion and lifecycle behavior are identical and only the drawing differs:

| Style | Appearance | Purpose |
| --- | --- | --- |
| `ring` (default) | amber ring, crosshair ticks and a white center dot, no glow | shape and color do not read as a pointer, so it stays distinguishable from Codex's own cursor |
| `arrow` | the light outline, translucent small arrow and soft glow this project drew originally | the historical v1 look, selected explicitly when preferred |

An unknown value falls back to the default `ring`; `cursorState` reports the effective `style` and `styleDescription`.

`CU_AGENT_CURSOR_VISIBILITY=target` (default) hides the cursor when its target point is covered, clips the complete glyph/glow to exposed target regions, and keeps motion and input running while hidden. `always` preserves the earlier top-level progress overlay. Unknown values fall back to `target`. The setting is read at helper startup; reconnect the MCP client after changing its environment. `cursorState` reports `visibilityMode`, `visibilityReason`, global logical-point `clipRects`, `occluderCount` and `occlusionGeometry`. These are drawing diagnostics, not input receipts. See [visibility rules and verification scope](CURSOR_OCCLUSION.md).

The cursor follows window movement between operations, hides and rejects the old mapping on size changes, and stops input if the window moves mid-move or mid-drag. It is also cleaned up after 30 seconds of idleness, on target hide/close, reset, cancellation and disconnect. `CU_AGENT_CURSOR=0` disables it.

`cursorState` returns visibility, relative/global logical points, panel state and the last 256 project-drawn records; it cannot be used to assert input success. `hideCursor` hides it explicitly.

```js
await cua.getScreenshot({
  displayId:1,
  region:{x:300,y:250,width:100,height:100},
  maxDimension:4096,
  includeAgentCursor:true
});
```

A display `region` uses logical points within that display. Ordinary window/display captures exclude the overlay cursor; `includeAgentCursor:true` allows visual verification on screen. App-allowlist mode disables display capture but still captures allowed windows. Lock screen, other Spaces and hidden desktops are outside the supported guarantees.

## Independence and measured limits

Standard MCP stdio → worker-thread REPL/cua → serial JSONL Swift helper; no original runtime/service is needed. The build target is macOS 14.4+, measured on macOS 26.6.2 arm64 with Node 24.15.0. Real mouse routing uses an undocumented system entry point, and CU_EXPERIMENTAL_APPKIT_FOCUS=1 uses app-local AppKit notices verified on this machine, off by default. Apps may activate or reorder themselves; on failure the operation stops and re-observes instead of restoring focus to hide the problem.

Native lower-layer analysis and new evidence are in REPL_CURSOR_RESEARCH.md and FOCUS_FIDELITY.md. Multiple displays only have coordinate-formula tests; other OS/app compatibility cannot be inferred from a single machine's acceptance.

The current original macOS build and the independent build are not identical: as measured on 2026-10-22 the original returns JPEG and keeps using Retina screenshot pixels after AX-only observation, while the independent build returns PNG and offers the explicit coordinate compatibility, reconnection and timed-input options above. Horizontal scrolling, input paths and browser capabilities still differ; see the [original baseline](ORIGINAL_BASELINE.md). These differences were measured explicitly for the first time here and do not mean the update introduced them.

## Concurrent-use profile (v1.2)

Real event strategies and synthetic AppKit activation are separate. The pi setup defaults to `CU_EXPERIMENTAL_APPKIT_FOCUS=0`; `--background-events` no longer turns it on. Only `--experimental-appkit-focus` opts into activation. `cua.status().background.appKitFocusPolicy` reports the selected policy.

Inactive AppKit apps can ignore raw CMD+A/menu shortcuts and text-selection drags. Prefer `pressKey('CMD+A')`, `selectText(...)`, and `click(index)` for their semantic equivalents. Do not retry failed input with activation automatically. The optional activation route can activate a background text input context while system focus stays elsewhere. [Input isolation](INPUT_ISOLATION.md) records the cause trace, original AX Raise observation and limits; a new single-participant cooperative comparison was accepted; this does not extend to experimental long holds.
