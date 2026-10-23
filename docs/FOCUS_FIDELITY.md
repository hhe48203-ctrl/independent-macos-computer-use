# Background events and focus fidelity: in progress

[中文版本](zh-CN/FOCUS_FIDELITY.md)

The installed app has been updated. Component identity, interface/behavior comparison and the re-derived functions for 2026-10-22 are in [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md). This page keeps its historical dates and native hash scope; old addresses do not apply to the new service.

This page records the v0.3 investigation, corrections, measured scope and mechanisms that are still unported. The current implementation includes system key-focus observation, anomaly routing checks, independent real events and an app-local AppKit focus route that is off by default; documents, pi, stock apps and one human concurrent-use round are verified on the current OS and cannot be extrapolated to arbitrary apps or to isolation at every instant.

## Evidence scope

The local app UI updated to `26.1013.40934` while `SkyComputerUseService`'s SHA-256 stayed at `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`. The addresses below hold only for that binary.

REA 6.5.0 called Ghidra 12.1.4. The official distribution's SHA-256 verified, and the native arm64 decompiler was built from its official sources. Whole-file analysis timed out after 600 seconds; the private JVM thread dump showed it was inside the Swift demangler processing symbols. Mapping the focus code to a 65,948-byte slice at the original addresses and seeding 188 function starts from the symbol table produced focus pseudo-code, and analysis was extended to 102,460 bytes for helper functions.

The slice lacks complete Mach-O types, external prototypes and Swift async calling conventions. Function starts are analyst-supplied seeds and cannot be called automatic discovery; argument meanings must be verified against ARM64 instructions. Import stubs and Objective-C selectors were cross-checked against dyld fixups. Raw binary slices, disassembly, pseudo-code and REA snapshots stay in the ignored `.research/` and never enter the deliverable.

## Confirmed mechanisms

| Fact | Basis and limits |
| --- | --- |
| The foreground app and the process actually receiving system keystrokes are different observations | the original uses `ApplicationRegistrySPI.getKeyFocusProcess`; the independent build successfully calls `CPSGetKeyFocusProcess` → `GetProcessPID`. This is read-only and never requests or steals focus. |
| The query needs a normally registered GUI process | a command-line attempt with no AppKit run loop returned 1003; an accessory process with no window returned 0 after starting a run loop. Unknown results are kept as null and the foreground PID is never substituted. The extra boolean flag returned is preserved as-is and its meaning is unconfirmed. |
| The original distinguishes three internal states | reflected fields are `applicationBelievesItIsActive`, `applicationBelievesItHasFocus` and `applicationIsActive`. Internal AppKit state is not real system focus. |
| Focus protection involves event taps, notices and a state machine | `SystemFocusStealPreventer`'s global process-notice tap, per-process keyboard/mouse taps, `currentFocus`, `previousFocus` and `suppression` are cross-confirmed by symbols, reflection and call sites. |
| A special helper process needs separate handling | `0x100758ef8` looks up a process whose name matches `ViewBridgeAuxiliary`. This path must not be mistaken for the Sky service's own PID. |
| A specific keyboard reroute excludes its own events | `0x100756280` checks the source PID; `0x100756370`, when a suppression exists and the event target matches the thief PID, re-posts to the recorded victim PID and suppresses the original event. This is not a general redirection rule for arbitrary keyboard events. |
| The original can release an associated focus request | `0x100755bbc` reads event field 71 and calls `ApplicationRegistrySPI.releaseKeyFocus(withID:)`. The independent code does not call that state-changing system interface yet. |
| The original has an activation-repair branch | `safelyEnforceActiveState` pauses updates, installs a temporary tap and preserves the previous foreground app; one branch calls `activateWithOptions:0` on that previous app if the target unexpectedly becomes foreground. It cannot be used as proof that the independent implementation never briefly changes focus. |

Process-notice constants were confirmed from constant-initialization instructions: event type 21, field 64 is the notice subtype, field 71 is the focus request ID above, and field 73 is the notice's associated PID. Subtypes include NewFront=2, LostKeyFocus=0x1000, KeyFocusTaken=0x4000, KeyFocusReturned=0x8000, KeyFocusChanged=0xf102, LostTypingFocus=0xf105 and TypingFocusChanged=0xf107. Field 73 refers to different roles for different subtypes and cannot be uniformly called "sender".

## Current understanding of the state machine

The following is an abstract model derived from instructions, pseudo-code and reflected fields, not yet full dynamic verification:

1. When the KeyFocusTaken-associated process belongs to a protected app, it records the thief PID, its app PID, the victim PID and release/return suppression flags, and suppresses the corresponding notices.
2. A specific KeyFocusReturned notice returned to the victim is suppressed exactly once and `suppressedReturnEvent` is recorded.
3. A KeyFocusChanged notice pointing at the observing helper updates current/previous focus, notifies the corresponding target callback, and releases the associated request when it matches a suppression. The original also has ViewBridge type/host-ownership conditions that cannot simply be dropped.
4. The ViewBridge keyboard tap excludes self-generated events and only re-posts to the victim on a matching record; notices such as NewFront participate in clearing suppressions.

The `Focus` enum's `regularApp`/`viewService` branches and the `suppression` field name are confirmed; exact layout and branch semantics still need item-by-item comparison with dynamic records. The current production helper has not ported this notice-filtering state machine, and it sends no fake activation notices and performs no activation-then-restore.

## What the independent implementation adds

`cu_status.inputFocus` returns `foregroundPID` and `keyFocusPID` (compatibility field `keyboardPID`) separately, plus `queryAvailable`, query/conversion errors and `keyboardFocusResolved`. A background operation's `inputFocusObservation` includes start/end results, change records, sample count, unresolved count and the maximum sampling gap.

If the target gains system keyboard focus during a background operation, `BACKGROUND_KEYBOARD_FOCUS_CHANGED` is reported. If the foreground app is unchanged but the process actually receiving keys changes, `BACKGROUND_KEYBOARD_ROUTE_CHANGED` is reported; the observation itself attributes this to no process, and normal user activity such as switching input methods can also make isolation unconfirmable. Foreground switching and unknown queries are handled separately. Detection never reclaims focus or reorders windows.

This is sampled observation, not a focus-steal prevention implementation, and it cannot prove there was no transient within a sampling gap. Actual gaps vary with blocking system calls and the report keeps the maximum; 5 ms is the request rate, not a guarantee.

`native/FocusTrace.swift` is an independent read-only test observer: it samples real focus, pointer and window order; it only listens to global process notices and never records other apps' keyboard text. Process event taps are limited to owned test apps, Calculator and an explicitly named TextEdit test process; TextEdit only records keyboard events carrying the known test marker and never user keyboard text. Target/source PID, key code and flags are recorded. Records are saved before exit. Test apps only record the test events they receive.

## Current real results

| Verification | Result | Evidence |
| --- | --- | --- |
| Standard MCP → independent helper → fully covered stock Calculator | six real keys `Escape,1,2,SHIFT+8,3,Return` showed 36; the process tap confirmed the target PID and helper source PID for six keyDowns. No AX action or global input was used. | `artifacts/raw-calculator-1792300842553/report.json` |
| The focus observation above | 368 queries; foreground and system keyboard focus were both Codex; maximum query gap about 16.8 ms. | `focus-trace.json` in the same directory |
| Default quiet regression | 11 checks and 9 MCP operations passed, including AX text/button/selection, real scrolling and keyboard-focus observation during arrangement and operation. 1530 queries, maximum gap about 20.9 ms. | `artifacts/background-safe-1792300933945/report.json` |
| Original `cua_repl` → stock Calculator | background keys 2+3, AX read back 5. | this round's normal plugin calls and local state records |
| Old owned AppKit text-field keyboard test (including the original comparison) | **contaminated by a harness defect**: the recorder raised on reading `NSEvent.subtype` for keyboard events, dropping the input. It cannot be used to judge original or AppKit compatibility; the raw records are retained. | `artifacts/original-focus-1792299693111`, `artifacts/original-regular-1792299909304`, `artifacts/field-editor-1792300729041`; correction below |
| Old independent-notice combination experiments | the same recorder defect affected text results. Focus and window sampling can keep their raw observations; text failures cannot be attributed to a system routing limitation. | `artifacts/notification-probe-*`, `notification-combined-*`, `notification-click-*`, `notification-timestamp-*` |

These early results cannot be extrapolated to arbitrary apps. This checkpoint had no new character-level human conclusion; the later complete document concurrent-use verification is listed at the end of this page. The earlier prototype failure that kept only 17 of 180 characters is retained and cannot be rewritten as a success.

### New independent real-input evidence

- `artifacts/raw-textedit-1792302014249/report.json`: a new TextEdit instance never touched by the original service received real `CMD+Down` and Unicode events through standard MCP, with Chinese, emoji, combining marks, a family ZWJ sequence and a newline read back exactly; no AX action was generated.
- `artifacts/pi-raw-text-1792302258660/report-corrected.json`: pi used only this MCP's tools, 6 calls and 0 tool errors, appending Chinese emoji text exactly, with target/source PIDs and system keyboard focus independently recorded. The original validator misread pi's nested result structure; the original failing report is retained, and the same raw record was re-checked after fixing the validator offline without resending actions.
- `artifacts/raw-pointer-1792303650093/report.json`: a fully covered owned ordinary AppKit app received real clicks, scrolling and 30 drag events; all 34 mouse packets had no modifier flags in AppKit, and per-packet delivery acknowledgement for clicks/drags passed. 1485 system focus queries observed no target focus gain, maximum gap about 20.1 ms.
- `artifacts/raw-stock-pointer-calculator-1792303703557/report.json`: the first three real button clicks stayed covered, then after the fourth the Calculator raised while the foreground and keyboard PIDs stayed Codex. The service reported `BACKGROUND_WINDOW_REORDERED` and stopped. This result does not count as a pass.
- `artifacts/raw-stock-pointer-textedit-1792303754031/report.json`: a long Unicode burst dropped characters, and a read-only snapshot was kept after the failure. The new version sends newline, return and Tab as separate packets with an exact UTF-16 read-back barrier per packet and never retries input.
- `artifacts/raw-stock-pointer-textedit-1792303899275/report.json`: after those fixes the long text operation passed exact validation, then TextEdit raised during a drag and the whole round still failed.

### The independent mouse-delivery alternative

The new code does not copy the original focus-notice filter. It uses the system's routing for Command background clicks and, inside the target process's event tap, removes the temporary Command flag before AppKit receives it. Filtering requires the helper source PID, target PID, window number and per-operation marker together; no global modifier down/up is sent, user hardware events are not modified, no activation notice is faked and the foreground is not restored. Every packet must be observed and have the flag removed, otherwise the operation errors and partial effects are not retried automatically.

Local testing found that a second `CGEventSetIntegerValueField(eventSourceUserData)` write kept the first value; the marker is therefore assigned once and read back before sending. High-bit truncation was initially suspected and then ruled out by a local experiment that posted nothing.

The owned EventPad's success does not prove AppKit controls or all stock apps will never raise. The stock-app failures above drove the later investigation: the original uses the same event number for down/up in one click, and production now uses a consistent bounded event number per gesture plus a persistent event source; results must come from new reports.

## Test arrangement corrections

The user confirmed TextEdit and the Background Automation window had come forward; the old interactive test arrangement did activate windows, and an explicit switch was added. Further experiments showed that directly launching a `.regular` AppKit process can become foreground even without an explicit activate — once for about 3.9 seconds this round. That round is recorded as an arrangement failure, its windows were stopped, and direct regular launches remain behind the interactive switch.

The new ordinary-app comparison uses Launch Services `open -g`, with the app still ordering itself back and ordering relatively for coverage, and observation starts before launch. Default regressions still use accessory apps. Each build checks for old test processes first and refuses to overwrite a Mach-O that is in use; the observer uses a per-round executable.

Reproducing the existing-Calculator real-event check:

```sh
npm run build
npm test
npm run test:background
node scripts/raw-calculator-test.mjs CALCULATOR_PID WINDOW_ID EXISTING_COVER_ID
```

The last command only uses a caller-specified, already fully covered Calculator window plus an existing cover window; it launches nothing, activates nothing and arranges no windows. It clears the Calculator's current expression and computes 12×3. The report states its scope separately.

## Acceptance status and remaining limits

- Direct MCP complex Unicode, real keys/pointer and the full pi flow are verified; the old owned-control keyboard failure came from the test recorder, and the new original comparison could navigate/select-all but that run's Chinese payload was not delivered, as described later.
- Independent scoped notices, the exact activation point, source-filtered pointer acknowledgement and cleanup are integrated. The original ViewBridge host ownership and global suppression/reroute state machine are still unported, and unknown third-party notices or keys are not filtered blindly.
- New operation phases for Calculator and TextEdit passed; the old raise failures are retained. Visible test arrangement is counted separately and is not a background action.
- The new observer has recorded the agreed foreground phrase, the actual receiving process and real pointer movement; this represents one owned-document scenario on the current OS, with sampling gaps and manual edits retained.
- Real external extraction verification of the deliverable is listed in validation-index.json. AX semantic paths and real-event paths keep independent evidence.

## Follow-up targeted analysis and cancellation verification

- REA/Ghidra also analyzed an 8,448-byte slice of the activation event builder (76 explicit function seeds; slice SHA-256 `8ea74d7a77087da817eb3a1cbb68fc59470e8746a82acc322908ed1b653f3871`). At `0x100736e00`, when the window number is non-zero, it sets the AppKitDefined subtype 1 flags to `0xc0000`, confirmed by ARM64 argument assignments. That bit pattern happens to equal the Control/Option modifier bits, but its full meaning in this private notice is unproven.
- `artifacts/scoped-activation-1792304316887`, `scoped-activation-1792304362996`: an independent experiment made an owned AppKit app's internal active/key state briefly true; system key focus stayed Codex and the target stayed covered. keyDown reached the app's queue but not the text control, so this is not a general real-input approach and was not adopted by default.
- `artifacts/raw-pointer-cancel-1792304060897/report.json`: cancelled after 3 drag packets, the target saw one press and one release, AppKit mouse flags were all zero and no window raised. After moving to a persistent per-gesture event source, click/scroll/drag regressions in `artifacts/raw-pointer-1792304572543/report.json` also passed.
- Static instructions confirmed that the current OS's `SLPSGetTypingFocusProcess` wrapper takes no input and returns a 32-bit reply value. An independent read-only prototype returned 79595, matching the Codex PID at the time; treating it as a PSN conversion returned -600. The value may be the typing PID but needs more call-site/cross-process verification, so it is not in production yet.

`CPSGetKeyFocusProcess` returns registry key focus, which is separate from hardware typing focus. The production API now reports the query source and `keyFocusPID` explicitly while keeping `keyboardPID` as a compatibility field. Real foreground character-level integrity must come from reading back explicitly tested text and from human concurrent-use verification, never from any single PID query.

Launching real TextEdit with `open -g -n` can still place the new window above the current foreground window even if the foreground PID never changed. Two launch-phase failures are retained, and `fresh-stock-test.mjs` therefore requires the explicit interactive arrangement `CU_TEST_ALLOW_FOREGROUND_SETUP=1`; it is not part of the default quiet regression. Every old Calculator/TextEdit instance launched by this task was cleaned up after saving test state.

### Activation-point semantics corrected

Tracing the static property at `0x1015397a0` and initialization at `0x1007a2c64` confirmed the original reads `UIElementAttribute.activationPoint`, not `titleUIElement`. The earlier description of a "title click" was a premature inference. The original builder constructs the mouse packet for that point after obtaining the window's `AXActivationPoint` and frame; without the point it falls back to AppKit notices only. The new independent experiment uses only an observed valid `AXActivationPoint` and fails before sending when it is missing, rather than guessing title coordinates.

### Standard controls and internal focus experiments

`artifacts/raw-controls-1792304690142/report.json`: the default real-event route completed 6 NSButton clicks, but dragging an inactive NSTextView produced no selection and the round failed. `artifacts/raw-controls-1792304790062/report.json`: an external owned prototype that briefly established internal active/key state passed the same 6 button clicks and a drag selecting 31 UTF-16 units; 1567 key-focus queries were all Codex with a maximum gap of about 20.1 ms. That prototype still used a hand-picked point; production is moving to the exact AXActivationPoint with scoped cleanup and observability. A prototype pass must not be counted as a production integration pass.

`CU_EXPERIMENTAL_APPKIT_FOCUS=1` is a development switch awaiting acceptance and is off by default. It posts local notices for real mouse click/drag, Unicode and nonsemantic keys without adding global activation/modifier events, performing foreground restoration or porting the unknown ViewBridge keyboard reroute rules. Text still requires an exact internal edit focus that existed before the operation and refuses to type if the selection range changes during preparation. The typing-focus raw-reply ABI was only verified on macOS 26.6.2 arm64 this round, so the experimental route is limited to that OS; it still does not replace foreground character-level verification.

### Integrated experiments and human observation (later)

- `artifacts/raw-controls-1792305862671/report.json`: the integrated route (experimental helper + `CU_EXPERIMENTAL_APPKIT_FOCUS=1`) passed 6 real NSButton clicks and a NSTextView drag selecting 31 UTF-16 units, 71 recorded window-order samples with no violation, and 1571 key-focus queries that stayed at iTerm PID 60023 (maximum gap about 17.0 ms). Each operation used the observed AXActivationPoint and generated 4 local notices; clicks acknowledged 4 packets and the drag acknowledged 34. The experimental typing-focus raw reply also stayed at 60023. This is an integrated owned-standard-control verification, not system TextEdit, foreground input or arbitrary-app acceptance.
- Earlier integrated startup attempts repeatedly hit `AX_WINDOW_UNRESOLVED` and kept refusing to act without relaxing identity/geometry matching; a read-only geometry diagnostic and a test-side readiness recheck were added. Passing later does not prove the root cause of those intermittent failures is known.
- `artifacts/human-raw-1792305405366/measurement-review.json`: the participant really operated Codex; 69 real background mouse MCP operations, 36 pointer positions inside the operation window, and no recorded window-order violation. The observer recorded a progressively growing matching prefix of 26 characters, and the full 45 characters were read back exactly after the timer ended. The original failing report is retained; a post-hoc read-back of the complete line cannot be counted as all happening within the 30 seconds.
- `artifacts/human-raw-1792305609342`: the participant's second 15-character line was also read back exactly afterwards, but the old continuous observer did not capture it. The original unconfirmed report is retained and was not rewritten as a success. The observer used to follow only AXFocusedUIElement, which in Codex can land on the WebArea; it now caches the input field once at startup and then compares only the bounded range after the known marker. `artifacts/human-observer-readonly-1792305800/locator-check.json` verifies the new locator finds the existing complete phrase; that is a locator check only, not a new human concurrent-use test.

The participant is not being asked to repeat input for now. A new complete concurrent-use acceptance still has to be completed under the corrected observer, and the experimental mechanism remains off by default.

### Locating and correcting the keyboard recorder defect

The owned-process diagnostic in `artifacts/raw-document-1792307688920` wrapped the test app's own event observer callbacks one by one, keeping each original callback called exactly once. The NSRemoteView, NSSpellChecker and TextInputUI callbacks all returned the original keyboard event; entering our own recording callback did not return normally. That does not support the earlier suspicion that ViewBridge intercepts events early. An independent Objective-C experiment that posts no input confirmed that the keyboard NSEvent `subtype` getter raises `NSInternalInconsistencyException`. AppKit's event loop catches the exception and stops dispatching that keystroke.

The recorder now reads properties according to event type. `tests/native-fixture-record.test.mjs` constructs real NSEvent keyDown/keyUp and a valid notice, calls only the actual recording function, and starts no window or posts no input; the old type-agnostic read would fail that regression process. The default quiet test also verifies the recorder does not break normal mouse/scroll handling. The original process and its callbacks were never modified; all internal observation prototypes run only in the ignored research directory and owned test processes and never enter the deliverable.

`artifacts/raw-document-1792307835777/report.json`: the normal-build independent helper through standard MCP stdio with the explicit experimental switch passed 7 real operations in a fresh, fully covered AppKit document: moving from a known start to the end, exact insertion of Chinese/emoji/combining marks/ZWJ/newline, real CMD+A select-all, CMD+Up, drag selection, scrolling and a button click. 121 recorded order comparisons had no violation, 2088 key-focus queries stayed at Codex PID 79595 with a maximum gap of about 16.3 ms, and the process tap verified the target and helper source PIDs for 8 keyDowns. The document's initial caret is now fixed at 0 so "already at the end" cannot produce a false navigation-key positive.

This pass does not cover new mouse verification on system TextEdit/Calculator or foreground human text integrity, and does not prove the original ViewBridge suppression/reroute state machine has been ported. The old stock-app raise failures and the unconfirmed human observations remain.

### Human concurrent-use verification of the full document path

`artifacts/human-raw-1792308602084/report.json`: the participant confirmed readiness and the measurement ran about 31.3 seconds after the prefix appeared; the background actually ran about 58.4 seconds over 19 rounds and 133 real event operations, including 19 Chinese/emoji text insertions plus navigation/select-all keys, clicks, selection drags and scrolling. The new phrase `CUH-9470-abcdef` in the foreground Codex field, all 15 UTF-16 units, was read back exactly 11 times before the operations ended. Growth from 8 to 15 was observed; the 10th character differed midway and the participant later explicitly confirmed "I edited it and also used backspace", kept in `participant-feedback.json`.

A read-only keyboard tap on the Codex process recorded 32 keyDowns and 32 keyUps during the agreed window, with raw source PID 0 and target field Codex PID 79595; no key codes, modifiers or keyboard text were read, and background helper events were not counted as human input. The measured segment had 1759 distinct pointer positions. 3370 stored window-order comparisons had no violation (the window list refreshes every 50 ms), 15226 key-focus queries were all Codex with a maximum query gap of about 154.9 ms; the gap is not a guarantee of continuous transient-free isolation.

This is one real concurrent-use pass on an owned AppKit document on the current OS with the explicit experimental switch; it cannot be extrapolated to arbitrary apps or to lossless input for every user. Earlier failed/unconfirmed reports were not rewritten. Stock-app mouse compatibility still needs a new operation-phase verification; visible arrangement is counted separately and cannot be treated as a background capability.
