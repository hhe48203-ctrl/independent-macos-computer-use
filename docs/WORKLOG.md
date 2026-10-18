# Work log

## Active focus-fidelity investigation (2026-10-17)

The follow-up goal remains active. See [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) for confirmed mechanisms, inferred state transitions, new read-only OS keyboard-focus observations, isolated experiments, and outstanding acceptance conditions. A standard MCP raw-key Calculator test now verifies the actual recipient and 12×3=36 under full occlusion. AppKit raw text input and complete foreground concurrency remain unresolved. Existing v0.2 ZIPs have not been replaced by this development checkpoint.

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
