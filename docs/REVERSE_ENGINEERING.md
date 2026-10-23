# Codex Computer Use investigation record

[中文版本](zh-CN/REVERSE_ENGINEERING.md)

The installed app has been updated. Component identity, interface/behavior comparison and the re-derived functions for 2026-10-22 are in [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md). This page keeps its historical dates and native hash scope; old addresses do not carry over to the new service.

Investigation date: 2026-10-17 (America/Edmonton). This report describes the local install; it is not a claim about every version. Summaries, versions and SHA-256 values are in [evidence-manifest.json](evidence-manifest.json). Raw REA Evidence, ASAR regions and disassembly remain only in the Git-ignored `.research/`, and the source deliverable explicitly excludes them.

## Evidence classes

**Observed fact O**: local files/processes/open file descriptors or real operation results. **Static fact S**: actual branches and fields in the installed JavaScript/declaration files. **Binary fact B**: Mach-O imports, exports, Swift symbols and instructions. **Inference I**: derived from several facts but not fully traced dynamically. **Unknown U**: insufficient evidence; an empty result or a name never substitutes for proof.

No ChatGPT/Codex package was modified, no original process was injected, no original private socket identity was called or forged, no credential file was read and TCC was not changed. Original behavior comparisons were done through the `cua_repl` tool this session legitimately exposes.

## Installed artifacts and processes

| Object | Local fact | Evidence |
| --- | --- | --- |
| `/Applications/ChatGPT.app` | bundle ID `com.openai.codex`, version `26.1013.31256`; contains an Electron/Codex Framework, a Swift service and a Node runtime | O: Info.plist, resource listings, process paths |
| `Contents/Resources/app.asar` | 582,401,226 bytes with 21,171 members; `.vite/build/main-CLu1A25j.js` is one of the main desktop bundles | O/S: ASAR header and member table; the bundle was not executed |
| `cua_node/manifest.json` | Node archive/runtime manifest declaring `24.21.0-cua.1`, a standalone `node` and `node_repl` | O/S |
| `@oai/cua-repl` | `0.1.0`; the launcher assembles the MCP description, trusted services and node_repl startup | S |
| `@oai/cua` | `0.2.6`; contains the tinysky replacement interface, app/browser bindings and result display | S |
| `@oai/sky` | `0.7.8`; platform/target dispatch plus the macOS client, native-pipe, policy and error types | S |
| `~/.codex/computer-use/Codex Computer Use.app` | the running `SkyComputerUseService`; the install package has another bundle with the same role | O |
| `SkyComputerUseService` | arm64, minimum OS 14.4, SDK 26.1; UUID `6AD9DE94-5466-38A4-B2E0-F81DFBC620DB` | B: REA inspect-macho |
| Related helpers | `SkyComputerUseClient.app`, `CUALockScreenGuardian.app`, the Installer and an authorization plug-in exist | O/B; existence does not mean all of their capabilities were verified |

The process tree observed here contained the app's main process, the Codex CLI, several `node_repl` instances, several Node workers and a separate Sky service. No process environment or authentication parameters were dumped. `lsof -a -p <service-pid> -U` confirmed the service opens `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`, and that a separate LockScreenLoginAuthorization socket exists. The latter was neither connected to nor tested.

## Recovered call chain

```mermaid
flowchart TD
  A[Agent: cua_repl.js] --> B[MCP launcher: @oai/cua-repl]
  B --> C[node_repl persistent JS runtime]
  C --> D[@oai/cua app/browser facade]
  D --> E[trusted service dispatch: sky]
  E --> F[@oai/sky/service and target adapters]
  F --> G[MacComputerUseClient]
  G --> H[nodeRepl.nativePipe + MacNativePipeTransport]
  H -->|length-prefixed JSON-RPC| I[SkyComputerUseService]
  H -. startup ensureService .-> J[Codex host-services pipe]
  J --> K[Electron managed-service lifecycle]
  K --> I
  I --> L[AX trees / capture / input / app policy]
  D --> M[separate browser service]
```

The in-process isolation details from the facade to the trusted worker remain U; JavaScript service dispatch and the Node host capability boundary are S, and they are not simplified into arbitrary ordinary Node package calls.

### 1. Electron managed configuration and service lifecycle (S)

Inside the ASAR, `main-CLu1A25j.js` sets `CUA_REPL_NODE_REPL_PATH` at about decoded-text offset 101,453, sets the enabled surfaces at about 101,488 and references the launcher path at about 101,638. It assembles the browser and sky trusted-service maps from the available surfaces and adjusts the generated MCP server. Offsets are decoded-text indices, not Mach-O addresses or cross-version stable positions.

Around 277,673 the same bundle constructs the `Contents/MacOS/SkyComputerUseService` path; nearby code maintains the expected executable, liveness checks, a cached PID, service-enabled state, serial lifecycle operations and a respawn callback. The UI's Computer Use, Appshots and Skysight switches together decide whether the service needs to run. This comes from branch code; the original service was not actively killed to test recovery.

### 2. MCP launcher and trusted services (S)

The launcher requires `CUA_REPL_NODE_REPL_PATH` to be absolute and validates `CUA_REPL_ENABLED_SURFACES`. The computer surface binds `sky` → `@oai/sky/service` and the browser surface binds a separate browser desktop service; it then starts node_repl with the service map, JS banner and tool-description overrides. It forwards termination signals and preserves the child exit status.

`@oai/cua`'s tinysky macOS app binding turns high-level methods such as `getAXState/click/drag/scroll/typeText/setValue/selectText/performSecondaryAction` into sky requests. Original macOS scroll is expressed in pages while the independent implementation explicitly uses pixel deltas, so they are not the same parameter protocol. The original facade also produces image and text results, so a returned object cannot be read directly as final MCP content.

### 3. JavaScript macOS client (S)

`MacComputerUseClient` defaults to API `CodexComputerUseIPC-5` with a default 120-second request deadline and caches transports per API version. Its request types include:

| Request type | Purpose confirmed from client branches |
| --- | --- |
| `ComputerUseIPCListAppsRequest` | app listing |
| `ComputerUseIPCAppPolicyRequest` | app access policy |
| `ComputerUseIPCAppStartRequest` | launch/bind an app |
| `ComputerUseIPCAppGetSkyshotRequest` | AX text and optional screenshot, accepts disableDiff |
| `ComputerUseIPCAppPerformActionRequest` | click, drag, scroll, typing, paste, set value, select and secondary actions |
| `ComputerUseIPCStartAudioRecordingRequest` / `StopAudioRecordingRequest` | recording control; neither dynamically tested nor rebuilt |

Action payloads are objects with case names. A coordinate click and an element click, for example, choose different `at` cases; element indices are converted to strings. Mouse buttons normalize to 0/1/2 and directions to up/down/left/right. Typing and shortcuts use separate actions. No path was found that simply concatenates everything into AppleScript.

### 4. Local communication protocol (S; socket existence is O)

The transport uses `nodeRepl.nativePipe.createConnection` rather than plain code calling `net.connect`; a missing trusted nodeRepl object raises an error. The default socket path matches lsof, and the code also supports an explicit path. This project sets none of those overrides.

A frame is a **4-byte UInt32 little-endian UTF-8 payload length plus a JSON payload**, capped at 8,388,608 bytes. The parser retains incomplete frames and supports several frames per read. Request IDs increase monotonically and responses must be JSON-RPC 2.0 with exactly one of result/error. This structure comes from the actual encode/decode/validate functions; no real request metadata from the original was captured or stored.

The handshake is `ping` carrying `clientApiVersion`, which returns `serverApiVersion` and is compared strictly. The outer action structure can be described as:

```json
{
  "id": 2,
  "jsonrpc": "2.0",
  "method": "request",
  "params": {
    "clientApiVersion": "CodexComputerUseIPC-5",
    "deadlineUnixMilliseconds": 0,
    "requestType": "ComputerUseIPCListAppsRequest",
    "request": {}
  }
}
```

This is a restatement from field structure, not a valid request that can be sent: the deadline is a placeholder and runtime may add turn metadata. No real metadata was read, copied or forged. Actions are serialized in the transport; a request timeout closes the connection and rejects pending calls.

The first connection attempt takes about 250 ms. On failure, `ensureService` / `service: computer-use` can be sent over the separate host-services pipe, or the service started with the trusted LaunchServices capability, then the connection retried within about 5 seconds. The main service transport and the host-services pipe are different connections with different roles.

### 5. Authentication and policy boundary (S/B; exact native decisions still U)

Electron's host-services `Cce` function creates a pipe with an 8 MiB frame limit and sets the socket file permissions to 0600. `Vd` builds a peer authorizer; the packaged build reads the build flavor and the native peer-authorization addon and calls an authorization function with the socket fd. There is a rejection branch when required packaging metadata is missing. This Electron branch cannot be equated with all of the Sky service's verification rules.

The Sky JS error table includes senderProcessNotAuthenticated, appNotAllowed and incompatibleClientVersion. The original service contains symbols for `ComputerUseIPCSenderAuthorization`, senderContextResolver, parent/responsible process identity, `prepareForAuthenticatedRequest` and permission callbacks, and imports audit-token, SecCode/SecTask and signing-information APIs. That confirms an identity and policy boundary exists; its exact signing requirements, all exceptions and the verification order were not fully decompiled and remain U.

This project never obtained control by forging `globalThis.nodeRepl`, using another bundle identity, re-signing the original binary or reusing the private socket. The independent helper goes through its own ordinary TCC flow. The original service has a SwiftProtobuf dependency, but **that is not evidence that the current JS→native socket uses protobuf**; the wire confirmed here is JSON-RPC.

### 6. Native capability layering (B/I)

REA's Mach-O results recorded 4,658 import items and 68,710 export items; some function names were redacted. Swift demangling and instruction checks located these boundaries:

| Local address/symbol | What can be confirmed |
| --- | --- |
| `0x100186fd8` `ComputerUseIPCServer.__allocating_init(jsonRPCSocketURL:)` | the IPC server accepts a JSON-RPC socket URL; the ARM64 instructions were checked, and no server methods can be recovered from this alone |
| `0x1001874e8` `ComputerUseIPCServer.start(...)` | lifecycle pattern, permissions, preparation before authentication and client event callbacks |
| `0x1001895cc` `handleEvent:withReplyEvent:` | another native event-handling entry exists; this path was not dynamically tested |
| `0x10006eebc` `ComputerUseAppController.updateSkyshot(...)` | treeCache, disableAXDiffing and skipScreenshot parameters |
| `0x100071ad4` `updateSkyshotSettlingIfNeeded(...)` | the native layer has a UI-settling entry; the exact stabilization algorithm is U |
| `0x100072dbc` `prepareToInteract(...)` | element refetch, location and cursor-interaction preparation boundary |
| `0x100074e64`, `0x10007fa8c` | element/coordinate click entries with hold, key, drag and optional skyshot return |
| `0x100078e8c`, `0x10007c3cc` | setValue and selectText with text context/selection type |
| `0x10025ec08`, `0x10025ec14` | CGEvent post and postToPid wrappers |

The original service imports AXUIElement querying/value-setting/actions, ScreenCaptureKit, AppKit and CoreGraphics, and contains AccessibilityTreePresentation, RefetchableSkyshotAXTree, screenshot cache, transformed-tree, focus/selected-text and diff-related types. Responsibilities can be recovered from this; symbol names cannot prove every branch is usable at runtime.

There are also WindowServerSPI, a lock-screen guardian, an installer authorization plug-in and more non-desktop business types. They suggest the original may integrate more deeply with the system (I) but do not prove hidden/locked scenarios succeed. The first implementation used none of these; v0.2 uses an independently, dynamically resolved system window-location SPI described in the second round; it still depends on neither the original service nor lock-screen components.

## Dynamic comparison and implementation results

Through the legitimately exposed `cua.getApp("io.local.computeruse.fixture")`, the original obtained a self-built AppKit window and returned numeric indices, compressed semantic roles, settable flags, the menu bar and focus. It then clicked, typed and pressed a button and observed `~` marks indicating changed AX diffs. That experiment verified the app facade and diff output are usable; it did not prove the original input is identical for every character or timing sequence.

In the same class of controlled window, the independent service verified screenshots, AX, Unicode, shortcuts, coordinate/element clicks, semantic actions, dragging, scrolling, OCR, cancellation cleanup, allowlists, text selection and menus through a **standard MCP client**. pi completed a Chinese input → click → read-back loop through its native MCP support. In addition, real Calculator's SwiftUI AX tree is readable and button actions confirmed `7 × 8 = 56`. See [VALIDATION.md](VALIDATION.md).

Practical substitutions in the independent implementation:

| Original role | This implementation |
| --- | --- |
| cua_repl / persistent JS facade | direct, typed MCP tools; no arbitrary eval |
| trusted sky service bridge | private subprocess pipe and an independent Swift helper |
| app binding + skyshot | pid/windowId + snapshot UUID + AX/PNG |
| semantic compression and incremental tree | bounded structured full tree, explicitly truncated |
| original input wrapper | AX semantic editing/clicking + window-directed CGEvent; explicit foreground mode keeps focus and hit checks |
| original permission/app policy | normal TCC + optional bundle allowlist |
| browser extension/DOM | not reproduced; browsers can use generic AX/screenshot/OCR |
| special lock-screen/hidden-session integration | not implemented |

## Actual use of REA, its limits and how to reproduce

REA sources were cloned to `.research/rea`, and the tool was run at the pinned npm version 6.5.0 without running `rea setup`, which would modify Codex configuration. The main commands:

```sh
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky --json > .research/evidence/sky-graph.json
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl --json > .research/evidence/cua-repl-graph.json
npx -y rea-agents@6.5.0 inspect-macho "$HOME/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService" --json > .research/evidence/service-macho.json
```

The sky analysis actually read 229 relevant files and parsed 228 JS/declaration files with no parse failure; cua-repl had 12 relevant files and 9 parsed items. REA explicitly states its graph coverage is incomplete, so `modules:0` cannot be read as "there are no modules", let alone used to claim a full call graph was recovered. The investigation relied on Evidence plus targeted reading of the actual files plus native symbol cross-checks.

`inspect-analysis-view` successfully produced a summary projection of the saved sky Evidence. An attempt at `recover-javascript-sources` returned capability_unavailable because the required Wakaru Linux x64 provider was not configured. No decompilation success was claimed to make the output look better; the actual minified ESM is small enough for targeted manual reading with the REA static graph as verification. Hopper/Ghidra were not installed, so native work used REA Mach-O metadata plus Xcode's `nm`, `swift-demangle` and `llvm-objdump`. Function addresses and local instructions were obtained; no claim is made that all Swift source was recovered.

The re-investigation entry point is `scripts/investigate.mjs`. It only reads the install and puts raw analysis in `.research/`. The first npm download writes to the npm cache and does not register or modify the original app's services. Public material adds product positioning and plug-in integration but cannot replace local internal implementation evidence:

- [REA source and usage](https://github.com/morluto/rea)
- [OpenAI Computer Use documentation](https://learn.chatgpt.com/docs/computer-use) — publicly describes macOS's normal permission flow.
- [Codex public core-plugins tests](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/executor_hooks_tests.rs) — shows the unified plugin and cua_repl names but not the local Swift service implementation.
- [Public runtime issue report](https://github.com/openai/codex/issues/42757) — an external symptom record, weaker evidence than the local install; the reporter's speculation is not treated as architectural proof.
- [Apple SCScreenshotManager API](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)
- [Official MCP TypeScript SDK stdio and tool API](https://ts.sdk.modelcontextprotocol.io/server)

## Unverified areas and later research boundaries

The exact machine-code control flow of native sender authorization, all XPC/Apple-event requests, the original's complete coordinate/event mapping details (partial window positioning was added later), the full AX semantic merge and stable-index algorithm, UI settling, the browser extension wire, hidden-desktop/lock-screen approaches and all security rejection branches are not fully recovered. A working prototype does not mean these unknowns are resolved.

Further work could cover Electron, WebKit, multi-window/multi-display, menus and popovers, and error-prone AX implementations on owned fixtures; deeper read-only decompilation of native local functions could explain performance and timing. Any later implementation still prefers public APIs and independent code. The local results already establish a reproducible software and test baseline and do not depend on these unknowns to run.

## Second round: targeted research into background window input (v0.2)

The first independent implementation's physical input needed the foreground, and a visible background window in a screenshot could not establish that background operation worked. This round separated the control path from the perception path and added real concurrent TextEdit/Calculator tests.

| Local symbol/address | Confirmed facts and evidence scope |
| --- | --- |
| `SynthesizedEvent.mouseEvent` `0x10075b260` | B: NSEvent mouseEvent → cgEvent, button field 3, mouse subtype field 7=3, window fields 91/92; window location is set afterwards |
| `SynthesizedEvent.scroll` `0x10075b4ec` | B: scroll event and window field; AppKit windowNumber carrier 51, cross-checked with events received locally O |
| `WindowServerSPI.setWindowLocation` `0x10027384c` | B: the original has a separate window-location entry; an independent experiment confirmed the system export CGEventSetWindowLocation can be resolved dynamically O, without the original service |
| `CGEventAPI.postToPid` `0x10025ec14` | B: the send path really calls process-directed delivery, which is not a global pointer warp |
| `syntheticallyActivateIfNeededForSendingClick` `0x100702bcc` | B: the original has a branch preparing internal activation state per click environment; it is not a global app activation |
| `SyntheticAppFocusEnforcer` / `SystemFocusStealPreventer` | B: the original is not just postToPid; it also has state tracking, event taps, system foreground observation and focus-protection components, not fully rebuilt |
| activate builder `0x100736e00` | B: constructs a type 13 AppKit-defined event, subtype 1, target window number, flags 0xc0000; deactivate is subtype 2 |
| CPS subtype getter | B: the original also has raw type 21 plus keyFocusReturned 0x8000, keyFocusTaken 0x4000 and lostKeyFocus 0x1000; recognizing constants alone does not prove the full protocol was recovered |

Raw disassembly remains in `.research/background/` and does not enter the deliverable. The independent implementation rebuilds API calls from its own source and does not distribute the original service implementation.

**O: coordinate experiment.** Posting directly with postToPid without setting the window-local location made the AppKit mouse position received fall outside the window. Independent experiments confirmed CGEventSetWindowLocation accepts window-top-left logical coordinates; incorrectly flipping Y again lands on the mirrored position. After the fix, real AppKit custom views received click/drag and NSScrollView and system TextEdit scrollbars really changed. The global pointer did not need to move.

**O: AX text.** TextEdit's AXSelectedText is writable and native NSTextFields can also be inserted into through writable attributes. AXSet returning success is not enough to prove the change happened: a read-only NSTextView once returned success while the value did not change. The delivered code checks writability first, then reads back the inserted result exactly, and never falls back to a global keyboard on failure. UTF-16 selection ranges for Chinese and emoji were measured.

**O and I: internal activation notices failed.** Porting the AppKit activation/deactivation notices alone suppressed some editing windows from raising automatically, with the foreground PID and pointer unchanged; however a real concurrent TextEdit test planned 180 characters and only the last 17 remained (O, failure evidence `artifacts/background-1792222936379`). This is inferred to involve keyboard routing or AppKit input state, without a proven exact root cause (I). It is not acceptable background isolation. That approach was removed entirely and no claim is made to have reproduced the original's focus protection. Final verification used AXPress-first single clicks, AX text editing and process-directed events without forged activation.

**O: original comparison boundary.** This round bound a new background fixture through normal cua_repl and the button count did change; typeText into the owned NSTextField did not insert the expected text. That only describes this one app/timing, not the original's capability across all apps. The original's own getAXState output, compressed indices and diff protocol also remain incompatible with the independent MCP.

More boundaries and reproduction steps are in [BACKGROUND.md](BACKGROUND.md). Public supplementary material includes [Codex's macOS background capability notes](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex), [Apple CGEventPostToPid](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)), and [bgclick's independent reverse-engineering record](https://github.com/Lakr233/bgclick-rev-skill/blob/main/bgclick-rev-skill.md). The last is a technical lead only, not success evidence or an instruction for this project; the final conclusions come from real local experiments.
