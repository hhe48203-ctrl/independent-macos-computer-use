# Evidence for the persistent REPL and the independent cursor

[中文版本](zh-CN/REPL_CURSOR_RESEARCH.md)

The installed app has been updated. Component identity, interface/behavior comparison and the re-derived functions for 2026-10-22 are in [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md). This page keeps its historical dates and native hash scope; old addresses do not carry over to the new service.

This round's checks are dated 2026-10-19 UTC. The feature baseline is 756b043 and the first REPL commit is 83a1083. Everything below observes the locally installed version and does not speak for all Codex versions.

## Confirmed original contract

Under the install's `Contents/Resources/cua_node/lib/node_modules/@oai/`, the `cua-repl` README and launcher plus `cua` 0.2.6's `tinysky_alt/types.d.ts` and `bind_mac_app.js` confirm: an independent Node REPL loads cua; app objects expose getAXState/getScreenshot/getAXStateAndScreenshot, click, drag, pressKey, scroll, selectText, setValue, typeText, paste and performSecondaryAction. Observation emits content by default, `emit:false` suppresses output, and `disableDiffing` controls diffs. macOS scroll uses pages and screenshots return bytes. Only the contract is recorded here; no original module was copied or distributed.

The local SkyComputerUseService SHA-256 was `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`. The symbol table and Swift demangling confirm a separate ComputerUseCursor with a nested Window, Style and AppMonitor, including targetWindowID, correspondingApplicationPID, move(to:aboveWindowID:relativeToWindow:nextInteractionTiming:animated:fadeIn:isDelegate:), show, press, windowDidMove, windowDidChangeScreen and activeSpaceDidChange. Style includes isPressed, angle, velocity and stretch state. The controller also has conversion functions from screenshot coordinates via scalingFactor to window/screen coordinates. That supports the architectural judgement of "a separate window presentation bound to the target and animated"; it is not enough to assert a complete implementation from names alone.

## REA static analysis and its limits

[REA](https://github.com/morluto/rea) 6.5.0's MCP open_binary/procedure_pseudo_code with the Ghidra 12.1.4 backend was used on bytes 0x90000..0x9c000 of the original file, mapped to arm64 raw-binary at 0x100090000, with 225 deduplicated symbol entries as seeds. Raw slices, symbols and pseudo-code exist only in the ignored `.research/cursor-v1/` and never enter the deliverable.

- The `show` entry at 0x100092f80 shows target-window state updates but includes out-of-range calls and truncation warnings, so it is not claimed to fully reproduce window ordering.
- Cursor initialization at 0x100090f70 shows Style references and a Window creation chain; the raw slice lacks implementations at external addresses, runtime metadata and full relocations, so all call semantics cannot be confirmed.
- The Objective-C `initWithContentRect` entry at 0x10009b4c8 is a non-returning initialization path, so valid window construction arguments cannot be derived from it.

These limits stay in the research record. The independent implementation's window parameters, trajectories and drawing are written by this project and verified on a real desktop; no original service was called and no original image assets were copied.

## This project's implementation and its differences

The Node default REPL evaluator keeps real lexical bindings and top-level `await`, and the worker thread allows bounded termination of infinite loops. AsyncLocalStorage binds asynchronous callbacks to their original execution, so a callback after completion cannot use the next execution to issue native work. The main process owns the serial native backend; cancel/timeout/reset terminates the worker and waits for native cleanup. This runtime targets trusted local code and is not a security sandbox.

App objects bind an exact PID+window and maintain their own latest snapshot, AX diffs and screenshot pixel scale. Window ambiguity, size changes and stale references fail explicitly. A missing app is never started implicitly; paste currently provides plain-text AX insertion only, and browser APIs, rich-text paste, modifier-key clicks and hold durations are not implemented.

The independent cursor uses an NSPanel that cannot become key/main, `ignoresMouseEvents` and ordinary AppKit drawing. A user-supplied reference image guided the light outline, translucent fill and soft glow; the image itself is not distributed. Motion eases in and out at about 60 Hz and input waits for arrival; real drag packets drive visible progress. Text and semantic actions point at an element centre and do not claim a measured insertion point. The cursor follows window movement between operations, hides and requires re-observation on scale/size changes, and stops if the window moves mid-operation so the display cannot disagree with delivery.

Ordinary window screenshots naturally exclude the independent panel; display screenshots exclude this process's cursor window through ScreenCaptureKit and may opt into `includeAgentCursor:true` for verification. An experiment found that `NSWindow.sharingType=.none` makes the cursor area black in system screenshots, so it was removed; a black image was never counted as visibility success.

## Current verification scope

`npm test` now covers lexical persistence, error recovery, infinite loop/cancel/exit, stale-callback isolation, window and screenshot coordinate contracts, negative coordinates and multi-display coordinate formulas, and continuous interpolation. Only one physical Retina display is available, so multi-display formula tests are not equivalent to real multi-display acceptance.

`scripts/repl-desktop-test.mjs` performs real AppKit text input, button clicks, screenshots and cursor movement only through the public `js`/`js_reset` interface. It records continuous intermediate frames, real screen crops, screenshots with and without the cursor, foreground/coverage relationships and the system pointer position. One lifecycle round kept the system pointer and foreground app unchanged. The desktop script also has a `pointerStationary=false` record whose source was not logged, so it can neither be attributed to the backend nor counted as proof the pointer stayed still.

The new pi run, human comparison, window lifecycle and real dragging are complete; the final deliverable still needs separate out-of-repository acceptance, with results and limits in VALIDATION.md. Old v0.3 evidence cannot substitute.

## New-interface human feedback: input-method and case switching (original failure)

On 2026-10-19 the new interface ran 84 real background operations with a human, and real keystrokes did reach Codex; the user reported the final short phrase intact after their edits but had difficulty switching between English/Chinese and between cases. That is a concurrent-use experience failure and cannot pass because the final text was intact or the foreground PID did not change. The observer also found no agreed marker at the start of the field, so automatic text detection did not pass either; its limitation of only checking the field start needs a separate fix and must not hide the input-method problem.

That round's evidence is in `artifacts/human-repl-1792389624088`. Human testing was paused and read-only input-source ID and HID/combined modifier-mask observers were added to separate the effects of native notices, real shortcuts, Unicode and the mouse path. v1 release acceptance was paused at that time. Corrections and the independent human comparison follow; the cause is still unproven and the old failure is retained.

## Corrected human comparison

Evidence `artifacts/ime-concurrency-1792390778074`: 10.001 s idle and 20.159 s of real background operation, 29 background operations in total. Both phases sampled the Canadian and SCIM input sources plus Caps Lock/Globe state changes; during the background phase 43 hardware-source keyDowns reached Codex, 2 TextInputSwitcher-source events reached Codex, and 17 helper key events went only to the owned target. Sampling always found Codex in the foreground. The participant explicitly reported "both phases normal, no obvious difference". Codex drafts were not read, so there is no exact character-level automatic verification and no claim of compatibility with all input methods or applications.

In the failing round's owned-app log, 72 local activation intervals averaged 342.8 ms with a maximum of 758.6 ms. Cursor animation for text/key used to run after the local activation and now runs before the notice; duration and frame-time assertions were added and the real document regression passes. The link between duration and the switching difficulty remains an inference with no proven unique root cause. There is no focus restoration and no filtering of human events.

Further static tracing also confirmed that this version's keyboard events use `sourceCreate(stateID:1)`, which on this machine enumerates to hidSystemState; at 0x100737654 the combined session flags are read, compared against the 0x1e0000 modifier mask, and when different a flagsChanged packet is built for the target process with the previous flags restored after the key packet. That difference is recorded for later research only and was not copied into production without verification. The REA raw slice is truncated across Swift indirect continuations, so those key calls were cross-checked with limited-address LLVM instructions and local enumerations; pseudo-code never entered the deliverable.
