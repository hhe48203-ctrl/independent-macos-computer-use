# Work log

## Active focus-fidelity investigation (2026-10-17)

The follow-up goal remains active. See [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) for confirmed mechanisms, inferred state transitions, read-only OS focus observations and outstanding acceptance conditions. Standard MCP and pi now complete a fresh covered AppKit document task with actual keys, Unicode, click, selection drag and scroll through the explicitly enabled experimental focus route. Full foreground concurrency and integrated stock-pointer behavior remain unresolved. Existing v0.2 ZIPs have not been replaced by this development checkpoint.

## Objective
Reconstruct a useful independent macOS Computer Use MCP server through local Codex/ChatGPT artifact investigation and REA. Never patch the original app, bypass TCC, extract credentials, or redistribute proprietary code. Deliver working software, client integration and reproducible tests.

## Plan
1. Inventory the installed application, processes, runtime modules and REA capabilities.
2. Recover desktop API shapes and the path from cua_repl through @oai/sky to SkyComputerUseService; retain provenance and separate inference.
3. Implement an independent Swift bridge over public macOS APIs and a portable stdio MCP server.
4. Verify permission reporting, screenshots, AX perception, targeting and input against a dedicated test app.
5. Connect pi to the MCP server and run an agent-driven desktop task; package source, setup and use documentation.

## Initial observations (2026-10-17, America/Edmonton)
- Installed app is /Applications/ChatGPT.app. Computer Use service runs from ~/.codex/computer-use/Codex Computer Use.app.
- A separate cua_node runtime includes node and node_repl; the built-in unified-computer-use plugin names its server cua_repl.
- SkyComputerUseService has an open Unix socket under the app group IPC directory, named computeruse.sock. No connection or credential access attempted.
- REA repository cloned for tool documentation/source inspection; proprietary artifacts and raw local evidence remain ignored under .research, never in distributable packages.

## Completed implementation and evidence
- REA 6.5.0 static analysis of @oai/sky and @oai/cua-repl, plus native Mach-O inspection. Local JavaScript branches, Swift symbols and bounded ARM64 disassembly cross-checked.
- Recovered versioned JSON-RPC framing, trusted runtime/service startup boundaries, app-action request variants and native capture/input responsibilities. Exact native authentication and proprietary UI algorithms remain explicitly unknown.
- Independently implemented Swift public-API helper and Node MCP server with 17 tools, normal TCC checks, app allowlist, snapshot-bound AX identities, screenshots/OCR, mouse/key/text/menu/selection actions and bounded cancellation cleanup.
- Eight transport/contract/entry tests and 21 live desktop checks passed. Real Calculator returned 56 for 7×8. pi completed a real Chinese text-and-button task via its native MCP tools.
- Portable plugin manifests, project-local pi registration, Chinese setup/use documentation and source evidence provenance added. Prebuilt arm64 plugin bundles the independent helper and open-source JavaScript dependencies; raw research and local desktop artifacts are excluded.
- Packaging verification unzips outside the repository and starts the actual prebuilt bundle without repository dependency lookup. No original app files or global agent configuration were modified.


## Background automation follow-up (v0.2)
- Audited v0.1 honestly: physical input was foreground; independent window capture alone did not establish background automation.
- Inspected original SynthesizedEvent, WindowServerSPI window-location setter, process-directed post, SyntheticAppFocusEnforcer and SystemFocusStealPreventer. Tested independent routing in real AppKit and stock TextEdit/Calculator.
- Reconstructed window-local event coordinates and exact process/window routing with dynamic CGEventSetWindowLocation SPI. No proprietary binary/runtime is linked or packaged.
- An internal activation-notification prototype kept foreground PID/pointer unchanged but lost foreground TextEdit input. Removed it after real concurrent-use validation exposed the defect; failed evidence retained.
- Background is now default: verified AX Unicode insertion, UTF-16 selection, verified select-all, AXPress-first click, independent SCK/AX/OCR and process/window-directed scroll/mouse events. No foreground fallback. Explicit foreground mode remains available separately.
- Raw mouse app/window reordering is detected and reported, not hidden by focus restoration. Generic keys remain best effort; no universal compatibility claim.
- Standard MCP real-app test preserved all 177 foreground characters with only the planned cursor trajectory while background calculations and AX edits ran. Human reports normal concurrent use, but observed human pointer movement did not appear in the measured trace; this limitation remains explicit.

- User later identified TextEdit and Background Automation windows taking focus during subsequent interactive test setup. Replaced the default test with nonactivating accessory windows ordered behind user windows. Production foreground control now requires CU_ENABLE_FOREGROUND=1, and native unknown modes fail closed. Interactive/foreground tests require CU_TEST_ALLOW_FOREGROUND_SETUP=1.
- Final quiet test passed 13 checks / 29 MCP operations with Codex continuously foreground. Reused existing stock Calculator and TextEdit windows for fully occluded calculations, Unicode editing and scrolling; no stock-app launch/focus/layout changes or global input were generated.
- Native policy, transport and contract suite now has11 passing tests. Prior successful 177-character synthetic concurrency evidence and later harness/stacking failures both retained; human feedback and missing pointer-overlap measurement remain distinct.

## Focus and raw-event checkpoint (2026-10-18)

- Fixed pointer packet identification: assigning CGEvent user data twice retained the original value on this OS. Now assign once, read it back before sending, and acknowledge source/target/window/operation-filtered pointer packets.
- Independent Command background routing with target-tap flag removal passes real covered EventPad click, scroll and drag. AppKit sees zero mouse modifiers. Per-gesture source and event number are retained. Mid-drag cancellation delivered one target-only mouse-up after three drag packets.
- Added bounded real Unicode text packets with exact per-packet UTF-16 acknowledgements and isolated newline controls. A long TextEdit operation passed after an earlier burst lost characters. Never resent a failed packet.
- REA/Ghidra seeded analysis of the activation builder confirmed flags 0xc0000 for window-local AppKit activation. A subsequent symbol/constant cross-check corrected the inferred click target from titleUIElement to AXActivationPoint.
- An isolated scoped-focus prototype passed six real NSButton clicks and selected 31 UTF-16 units by dragging a covered NSTextView, while registry key focus stayed in Codex. Integration is behind CU_EXPERIMENTAL_APPKIT_FOCUS=1 and currently uses a separate development helper; it remains unvalidated and disabled by default.
- Kept stock-app ordering failures and startup failures. open -g is insufficient to guarantee window stacking, so new stock-app startup diagnostics require explicitly arranged interactive setup. Saved and closed old owned stock-test apps; no original service process was modified.
- Added an opt-in human test observer that compares only a known CUH-marked phrase in the focused Codex input, records matching lengths rather than draft/key text, and checks real pointer movement. It has not yet been run with a participant.
- Unit/transport/schema/native policy suite: 14 passed at the packetization checkpoint. Distributable v0.2 archives are unchanged; goal remains active.

## Corrected keyboard instrumentation and integrated document checkpoint

- Earliest divergence: keyboard packets reached the disposable fixture and NSApplication.sendEvent, but not the text responder. Instrumenting only that owned process showed the fixture's own local monitor entered without returning. It read NSEvent.subtype on keys, which raises NSInternalInconsistencyException. NSRemoteView and other framework callbacks returned the event normally. This was a test-observer defect, not evidence of an unknown AppKit routing restriction. Older custom-fixture keyboard failures, including original CU comparisons, are marked contaminated rather than silently rewritten.
- Made fixture event logging type-aware. A native runtime regression constructs keyDown/keyUp and an AppKit notice, invokes the real logger and verifies serialization without posting any input. The bad subtype getter was independently reproduced using a caught Objective-C exception. The document caret starts at 0 so CMD+Down must change observable state.
- Standard build + standard MCP with CU_EXPERIMENTAL_APPKIT_FOCUS=1: `raw-document-1792307835777` passed all 7 real-event operations, exact Unicode/UTF-16 insertion including NFD, ZWJ and newline, plus actual recipient and recorded stacking checks. No original service or AX mutation used.
- pi `pi-document-1792308204397`: 16 tool calls, 7 real mutations, zero tool errors; exact ordinary Chinese/emoji suffix, full selection, drag selection, scroll and button result. 426 recorded stacking comparisons had no violations; 5329 key-focus polls stayed in Codex, maximum gap about15.1ms. Earlier two pi runs supplied normalized/literal-escaped text and correctly failed exact end-to-end validation; they remain retained. Encoding edge cases are separately proved by direct MCP, not inferred from pi's short suffix.
- Default quiet regression `background-safe-1792307912742`: 11 checks passed. Complete unit/transport/schema/native suite: 17 passed, including fixture-recording and live-executable replacement guards.
- Corrected original reference `original-document-1792308251180`: navigation and select-all work in the fresh fixture. Original typeText generated only brackets and a space, with Chinese/emoji keyboard packets absent; whole reference failed. This does not change independent Unicode success or justify a general claim about original text support.
- Bounded human-field rediscovery now handles replaced Codex input nodes without reading their values. A four-second read-only continuous check (`human-observer-continuous-readonly-1792308413040`) observed the previously agreed full15-character phrase74times; no new input, no concurrency claim. An opt-in foreground recipient observer records only counts and source/target PIDs during the agreed start interval, never key codes or key text. The new document-concurrency harness is prepared, not yet accepted.

## v0.3 release verification

- Human document concurrency `human-raw-1792308602084` passed observed checks:133 real background mutations, exact final15-unit Codex phrase,32 keyDown and32 keyUp recipient events and1759 measured pointer positions. Participant confirmed intentional edits/backspaces. Intermediate mismatch and maximum154.9ms focus-sampling gap remain explicit.
- New Calculator/TextEdit processes were arranged with announced visible setup, counted separately. Their operation reports `raw-stock-pointer-calculator-1792309012054` and `raw-stock-pointer-textedit-1792309078889` passed real clicks/56, complex exact Unicode,30-unit drag selection and scrolling with recorded stacking checks. No original service was used for independent actions.
- cu_launch now returns an already-running single instance without reopening it. Starting a new background app requires explicit allowVisibleWindows:true because real startup-window raising was observed. Native and schema guards reject the default path before opening anything. Foreground control remains disabled by default.
- Runtime version0.3.0, project-local pi registration with scoped events enabled on this OS, default-safe generic plugin manifest, and a separate event-profile example. The actual project pi called only cu_status and confirmed version0.3.0/experimental focus enabled/foreground disabled.
- External ZIP verification now includes real ScreenCaptureKit PNG, Vision OCR and all7document mutations, not just server startup. The source tarball independently installs locked dependencies with scripts disabled and isolated npm configuration, builds the native helper, and runs18checks with zero skipped. Release report aliases live in artifacts/release-verification and carry the actual archive hashes.
- Executable-overwrite protection now canonicalizes symlinks; the live-process regression exercises direct and alias build paths. Temporary extraction cleanup also handles /tmp→/private/tmp. Old source-test config failures are retained; anonymous user/global npm configuration files are separate.
- Distribution includes independent code, dependency licenses, usage/testing documents, source and separate evidence archives. Proprietary slices, pseudocode, private sockets/authentication and unrelated user contents are excluded. Remaining compatibility limits are release scope, not a claim that the original ViewBridge state machine or JavaScript/browser runtime was fully reproduced.

## v1.0.0 (2026-10-19)

- Replaced the 17 `cu_*` tools with `js`/`js_reset` over a persistent lexical REPL (top-level await, app objects, rich screenshots, AX diffs, OCR) and shipped an independent nonactivating cursor with eased motion.
- Accepted by 25 regressions plus real document, pi and human rounds; the first IME/case-switching human round is retained as a failure and its later correction is recorded separately.

## v1.1.0 (2026-10-21)

- Added the original screenshot-pixel coordinate mode, real modifier multi-select and 0..5000 ms holds with release on cancel, calibrated vertical scrolling and explicit reconnect.
- 39 regressions with no skips; 20 scroll cases matched real offsets; packaged and source-archive acceptance covered document, modifier/hold/cancel and reconnect. Horizontal compatibility still not claimed.

## v1.2.0 (2026-10-23)

- Removed synthetic AppKit activation from the default configuration and made the cooperative profile explicit (`setup-pi.mjs`, `--experimental-appkit-focus`); inactive-app raw menu shortcuts and text drags stay recorded as failures, with semantic equivalents used instead.
- Established that the experimental route activates the target text input context while system key focus stays elsewhere, and observed the original tool causing AX Raise on an owned target; the exact original decision branch is still unproven.
- 49 regressions with no skips, a packaged five-scenario gate, and one participant-accepted cooperative comparison (10.001 s idle, 20.551 s active, 30 operations, zero synthetic activation sessions).

## v1.3.0 (2026-10-24)

- Made cursor visibility follow the target's exposed area (`CU_AGENT_CURSOR_VISIBILITY=target`, default) with an optional `always` overlay; hiding or clipping never cancels an action.
- 51 regressions with no skips, live fully covered operations, extracted-ZIP acceptance and 1x/2x offscreen pixel checks for both styles and their glow. Visible live clipping is offscreen evidence only.
- Recorded that the installed original moved to 26.1021.31345 / sky 0.7.13 after the accepted baseline, so the drift watcher and the baseline check both report that a new comparison round is required.
