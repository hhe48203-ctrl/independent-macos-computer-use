# Background Window Automation

[中文版本](zh-CN/BACKGROUND.md)

v0.3 adds registry key-focus observation, real Unicode events, source-filtered mouse acknowledgement, and an AppKit app-local state route that is off by default and limited to specific OS versions. System Calculator, TextEdit and one human concurrent-use round passed on the current OS. Scope and limits are in the [release notes](RELEASE_NOTES.md) and the [focus fidelity record](FOCUS_FIDELITY.md). The v0.2 historical evidence below is deliberately retained and is not the new real-event acceptance.

v0.1's physical input was foreground operation and the first delivery could not satisfy this round's background requirement. v0.2 added an independent default background route. Three distinct mechanisms are separated here so that "the mouse did not move" is never mistaken for "the user was not disturbed". Final results are judged by the standard-MCP reports in this machine's artifacts plus human feedback.

| Capability | Mechanism | Boundary |
| --- | --- | --- |
| Occluded AX / PNG / OCR | AXUIElement, SCK desktopIndependentWindow, Vision | target must be in the current unlocked GUI session; no promise for minimized windows or other Spaces |
| Single button click | auto uses AXPress first; coordinates resolve inside the target window's AX tree | only the semantics the control exposes; never disguised as a real mouse event |
| Mouse events on custom controls | NSEvent → CGEvent + window fields + CGEventSetWindowLocation → postToPid | the SPI is undocumented; controls may ignore or raise their window, so verification is required |
| Unicode text insertion | AXSelectedText or AXValue, replacing the current UTF-16 range and read back exactly | editable AX controls; does not emulate keyboard layout, IME composition or key listeners |
| Explicit real Unicode events | `cu_type_text strategy:event` on an already focused element with per-packet exact UTF-16 acknowledgement | no AX write, no IME composition; frameworks may ignore or transform packets, and failures are not resent |
| Selection and select-all | AXSelectedTextRange, CMD+A preferring AX | the control must support a writable selection range |
| Plain keys and shortcuts | postToPid with the main key and modifier flags only | applications receive them inconsistently; delivery does not mean the UI reacted |
| Scroll / drag | target-PID/window-directed CGEvent | scrolling is verified in native scroll areas; dragging depends on app state and may raise the window, especially after editing |
| Explicit foreground operation | `cu_focus` / `mode:foreground` only after CU_ENABLE_FOREGROUND=1 | may take focus and move the real pointer; not a background capability |

No background route calls activate/AXRaise/global HID input, grabs the foreground and restores it, moves the real pointer, or borrows the original service or TCC identity. A background failure never falls back to foreground mode automatically.

## How to verify

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:background
npm run test:pi
```

The default `npm run test:background` neither activates apps nor generates global input. Owned AppKit windows are ordered back first, then the cover window is ordered above the target while still behind user windows. Every step proves full coverage via CGWindowList z-order, rectangles and alpha, and then reads back the real UI effect. SCK screenshots and OCR check the target content. `CU_TEST_EXISTING_TARGETS=<previous report path>` retests still-live TextEdit and Calculator windows from earlier runs without launching, focusing or rearranging stock apps; TextEdit is only touched when its existing window is already fully covered, and the owned file title is checked.

The original full layout/concurrency driver remains as an interactive test and must be run explicitly with `CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:background:interactive`; it activates test windows and generates foreground letters and pointer movement. The explicit foreground-mode regression likewise requires `CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:desktop`. That arrangement is not a background action and must never run silently while a person is working.

The AppKit observer samples the global foreground PID and real pointer position on a 5 ms timer and listens for activation notices; it never collects keystrokes from other apps. Timer sampling is not a mathematical proof of every instant, so the test additionally requires the real foreground TextEdit input to be character-complete and the pointer trace to contain only the positions the driver planned. The driver checks the foreground PID before each keystroke and aborts on mismatch. It only types letters into a newly created test document, never into the user's documents.

This synthetic concurrency acceptance is a real GUI application test, not a mock, but it is not called a human test either. The human phase runs separately with `node scripts/human-background-test.mjs /absolute/path/to/artifacts/background-RUN`; only when foreground testing is explicitly allowed, first run `CU_TEST_ALLOW_FOREGROUND_SETUP=1 CU_KEEP_TEST_APPS=1 npm run test:background:interactive` to leave the target and observer alive, and after KEEP_READY announce a 30-second start to the participant. The participant uses other apps freely while the test only computes in the background and records PIDs, pointer and target window state. Afterwards their actual experience is collected; without feedback the report keeps `awaiting-human-feedback`.

## Rejected approaches

The original has SyntheticAppFocusEnforcer and SystemFocusStealPreventer. An independent experiment that only posted app-local AppKit activation notices did stop some editing windows from raising on click, and the NSWorkspace foreground PID and physical pointer appeared unchanged. Yet concurrent TextEdit input kept only the last 17 of the 180 planned characters. That shows foreground PID and pointer position alone can misjudge isolation; the internal notices may change keyboard routing or AppKit input state, and the exact cause is still an inference.

v0.2 removed that prototype. v0.3 rebuilt a different, scoped route from later static and dynamic evidence: the exact AXActivationPoint, per-packet source-filtered acknowledgement, local state cleanup, and key/typing-focus diagnostics, enabled explicitly with `CU_EXPERIMENTAL_APPKIT_FOCUS=1` (off by default) and limited to macOS 26.6.2 arm64. It passed a new human concurrent-use round and stock-app operation tests; one pass cannot erase the old failure or promise compatibility with arbitrary apps. Default button clicks still use AXPress and the default event route emits none of these notices. When an app activates or reorders itself, the operation reports an error instead of reclaiming the window to hide it.

## Conservative limits

Background support is a capability that holds for verified controls and app states and cannot claim full compatibility with arbitrary macOS apps. Self-drawn canvases, games, Electron/Chromium, pop-up menus, in-app modals, multi-window keyboard routing and windows that activate themselves all behave differently. Global app menus are explicitly rejected in background mode. Raw events may already have partially taken effect before an isolation check fails; observe first and never retry blindly. Cancellation makes a best effort to release a directed button, but a hard kill cannot roll back system calls.

Using undocumented system symbols is a compatibility trade-off, not a permission bypass. If the state reports `windowLocationSPIAvailable=false`, raw pointer routing fails rather than switching to global input; AX text, buttons and window perception still work. Nothing is verified on Intel, macOS 14/15, multiple displays or long sessions.

## Human feedback and corrected test entry points

A participant typed in the Codex input field on this same Mac and confirmed the text was intact and normal, then reported that a recent test had brought TextEdit and the Background Automation window forward again. That run really did execute the focusing arrangement and synthetic foreground input again, so the whole run cannot be described as non-disturbing. The raw mouse event's automatic raise failure is also retained, and not everything is blamed on the arrangement.

Correction: the production helper now forbids foreground/focus by default (CU_ENABLE_FOREGROUND=1 is required), and unknown modes are rejected. The default tests were changed to nonactivating arrangement, and the two scripts that take over the desktop must be enabled explicitly. Background acceptance now uses existing covered windows and never reclaims the foreground to pass. Human pointer movement was not captured by the old observer, so timing overlap could not be proven; the new observer records both CGEvent and NSEvent position readings, keeping measurement and subjective feedback separate.

## Reproducing the newer checkpoints

```sh
node scripts/raw-pointer-test.mjs
node scripts/raw-pointer-cancel-test.mjs
# negative control: NSButton clicks pass on the default route, dragging an inactive text view may still fail
node scripts/raw-controls-test.mjs
```

The normal build also contains the experimental route, disabled by default. The fresh, fully covered document test covers real Unicode, CMD+A/CMD+Down/CMD+Up, drag selection, scrolling and button clicks:

```sh
npm run build
npm test
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/raw-document-test.mjs
# pi uses its own working directory and only this project's MCP tools for the same task
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/pi-document-test.mjs
```

These tests neither launch stock TextEdit/Calculator nor require participant input, and they do not replace foreground text-integrity or arbitrary-app compatibility acceptance. The old owned-text-field keyboard failure was affected by a recorder defect; it is corrected and a regression that posts no input was added, as described in `FOCUS_FIDELITY.md`.

The three commands above only start owned test apps that order themselves behind user windows. The recorded window order is checked separately, and missing samples never count as a pass. Each pointer packet's `pointerDelivery` only confirms that routing flags matching the source/target/window/operation marker were removed; the UI effect still has to be read back.

Explicit experimental development helper (not yet accepted as a release):

```sh
CU_BUILD_DIRECTORY=.build/focus-experimental node scripts/build.mjs
CU_EXPERIMENTAL_APPKIT_FOCUS=1 \
CU_TEST_NATIVE_HELPER="$PWD/.build/focus-experimental/Local Computer Use.app/Contents/MacOS/computer-use-bridge" \
node scripts/raw-controls-test.mjs
```

The new human check script is `human-raw-background-test.mjs`, which requires an arranged participant and `CU_TEST_HUMAN_AGREED=1`. It arranges quietly, prints `HUMAN_READY`, and only starts the 30-second operation once a `start` file appears in that directory; the participant then types the agreed CUH marker text literally and moves the mouse. The observer compares only the bounded range starting at the known marker and stores matching lengths and completion state, never unmarked drafts or hardware keyboard text. Without complete text or pointer-overlap evidence the result is failed/unconfirmed.
