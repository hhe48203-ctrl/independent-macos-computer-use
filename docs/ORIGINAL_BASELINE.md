# Original reference baseline: 2026-10-22

[中文版本](zh-CN/ORIGINAL_BASELINE.md)

This page keeps the v1.0 historical baseline. The later v1.1 coordinate compatibility, modifier keys/durations, scroll calibration and explicit reconnection are in the [compatibility acceptance](COMPATIBILITY_V1_1.md).

This update records the local install's identity, interface checks and behavior comparison. The production runtime stays at v1.0.0; the original app is not modified, its private socket is not connected, its proprietary modules are not imported, and system permissions are not reset. Original actions are sent only through the `cua_repl` this session legitimately exposes, and observers read only owned windows and input/window metadata.

The machine manifest is [original-baseline.json](original-baseline.json); results, function identities and REA Evidence IDs are in [original-comparison.json](original-comparison.json). The older [evidence-manifest.json](evidence-manifest.json) is retained as history and is not overwritten.

## Install changes

| Component | Previous manifest | This round |
| --- | --- | --- |
| Codex App | 26.1013.31256 | 26.1016.61520, build 21421 |
| @oai/cua-repl | 0.1.0 | 0.1.2 |
| @oai/sky | 0.7.8 | 0.7.12 |
| @oai/cua | 0.2.6 | 0.2.6; no full package inventory was saved before, so unchanged content cannot be asserted |
| @oai/browser-desktop | not recorded previously | 0.1.1; this does not prove it is new this round |
| Native service size | 24,934,560 | 25,016,528 |
| Native UUID | 6AD9DE94-5466-38A4-B2E0-F81DFBC620DB | 374107F0-B948-3F44-A251-E9E7D5FEBC70 |

The old manifest is dated 17 October; later focus records list App 26.1013.40934 but with the same old native service hash. The actually installed service matches the one bundled in the runtime package:

`ef4f4dc20e64ee29027bf178f553c0c39b9cfa517a4cd39734510259f23c058a`

The native binary is still arm64 with a minimum of macOS 14.4 and SDK 26.1. The app ASAR hash also changed; this round did not rebuild the whole ASAR call graph.

In the REA static graph comparison, 221 included sky files were identical, 8 changed and 5 were added; cua-repl had 8 identical and 4 changed. The sky changes touch native-pipe, audio processing/model checks and Linux input, and add Linux `typeCharacters`. macOS `client.js` and `sky.js` are byte-identical and still use `CodexComputerUseIPC-5` with the default 120-second request deadline. native-pipe still uses 4-byte little-endian lengths, an 8 MiB cap and JSON-RPC response checks; extended audio host requests do not mean the desktop action protocol changed. Only this private protocol was checked statically; no private request was sent.

## Interface checks

The macOS app binding still exposes 12 main methods: getAXState, getScreenshot, getAXStateAndScreenshot, click, drag, pressKey, scroll, selectText, setValue, typeText, paste and performSecondaryAction. `emit`/`disableDiffing` are still controlled by the observation methods. The new launcher still gives the trusted Node REPL a `cua`, with MCP entries `js`/`js_reset`; this project's public tools therefore need no rename.

| Contract | Current original macOS | Independent v1 |
| --- | --- | --- |
| App selection | name, path, bundle ID; the binding keeps the app identity and re-resolves the instance. This round an old object kept operating a newly created test process with the same bundle | exact PID/window, rebinding required after invalidation; a missing app is never launched implicitly |
| Inventory | apps and browsers | apps/windows/status; no browser interface |
| AX | observation explicitly returns a tree or diff; an action is not itself a re-observation | an AX diff is emitted automatically after each action |
| Screenshot bytes | actually JPEG this round, 1280×984 | PNG this round, 1280×984 |
| Array coordinates after AX-only | still interpreted as Retina screenshot pixels this round; 40,387 selected nothing, 80,774 to 540,774 selected 31 UTF-16 units | restore window logical points from the document; 40,387 to 270,387 selected 31 UTF-16 units |
| Text | typeText(text); macOS rejects the Linux-only second element index | verified AX by default; strategy:event sends Unicode events read back exactly |
| Page scrolling | macOS pages; 0.6 produced a vertical value of 0.1735294 | 0.6 produced 0.1388235; implemented as window edge × 0.8 × pages, so identical distance is not claimed |
| Click/key options | include modifiers and hold durations; keys use xdotool-style syntax | common super/CMD syntax supported; modifier clicks and hold durations are explicitly rejected |
| Text paste | static documentation says it uses the system pasteboard and restores the old contents, with format options | plain-text AX insertion; rich text not implemented |

The JPEG format and the AX-only pixel behavior were measured explicitly for the first time this round, and **there is no evidence they were introduced by this version update**. These differences must not be written as "a perfect replica", and the existing v1 coordinate rules are not silently changed during a baseline check. Paste/clipboard, audio, Linux/Windows, browsers and all option combinations were not dynamically covered this round.

## Real behavior comparison

The same owned AppKit document with the target fully covered. After each original call, an independent read-only AX observer read the result back; a tool returning no error was never treated as action success. Each implementation used the coordinate rules already verified for it.

| Check | Original | Independent |
| --- | --- | --- |
| To end, select all, back to start | 3 passed | 3 passed |
| Exact Chinese, emoji, NFD, ZWJ append | failed: expected `【基线 中文🙂 é 👩‍💻】`, got `【  e 】` | exactly matched |
| Text drag selection | 31 UTF-16 units | 31 UTF-16 units |
| Page scrolling | passed, distances above | passed, distances above |
| Rich screenshot, screenshot-pixel click | 2 passed, button count 1 | 2 passed, button count 1 |
| AX set value, Chinese substring selection | 2 passed | 2 passed |
| Total | 9/10, completed-with-differences | 10/10, passed |

The original recorded 25,719 focus samples with a maximum gap of about 119.5 ms; the independent build's latest data is in the JSON results. Neither sampled the target taking the foreground or system keyboard focus, and no window-order sample showed the target raising. Sampling cannot guarantee isolation at every instant. The user may have moved the system pointer during the run, so pointer changes cannot be attributed to the backend; this round had no new human character-level concurrent/IME acceptance.

Two 126×126 window candidates of the original service showed 24 and 120 distinct geometries, supporting that intermediate positions were observed this round; not every candidate is proven to be the cursor. Polling is not a draw-rate measurement. The independent build's continuous motion and lifecycle guarantees still rest on the existing v1 tests, and this round did not change the cursor implementation.

All 25 existing regressions and 5 new baseline-decision checks passed, 30 in total with 0 skips; the new checks prevent repeated steps from replacing a missing one, an expired observer from reporting success, and an independent failure from returning exit code zero. The real desktop comparison called the independent build through the public `js` interface; no legacy `cu_*` entry was substituted.

## Functions re-reverse engineered for the Unicode difference

In the current service, `AccessibilitySupport.SynthesizedEvent.type(string:)` enters at `0x10075e2c8`. Its asynchronous continuation loads the `keyPressesForString:` selector at `0x10075e408` and dispatches through Objective-C at `0x10075e418`; the selector reference is `0x1014cadb8`.

`+[SAIVirtualKeyPress keyPressesForString:]` moved from the old symbol address `0x10024c2e4` to **`0x10024eb48`**, a 604-byte boundary this round. Targeted REA/Ghidra plus limited-address LLVM and indirect symbol table checks confirm:

1. It reads the current keyboard layout and uses UCKeyTranslate.
2. It processes the NSString's UTF-16 units one by one, iterating key codes 0..127 and 8 modifier states to find a match; LF is mapped to CR.
3. When no mapping is found it takes a logging branch and moves on, without injecting the unmatched Unicode unit in that function.

This current path explains why arbitrary Chinese, emoji surrogate pairs and combining marks cannot be assumed to convert reliably, and it matches what the recipient window measured. It does not prove that every input-method problem or arbitrary application failure has only this cause. Not all continuations from the RPC `type_text` dispatch to that asynchronous entry were recovered this round; the converter call and loop are static facts, and their link to the observed dropped characters is supported by recipient results but must not be written as a fully captured dynamic call chain. The independent build continues to use its own verified Unicode event packetization and per-packet read-back and does not copy the original's character loss.

REA 6.5.0 and Ghidra 12.1.4 were used with a 1292-byte read-only raw slice and 8 explicit seeds. The pseudo-code tail had bad-instruction and neighbouring-function warnings, so the core conclusion relies on the 604-byte instruction range plus TIS/UCKeyTranslate/NSLog import checks; pseudo-code is not treated as complete source. A full REA inspect-macho timed out after 180 seconds and was not concealed as a success.

Fragments from the named cursor `move`/`show` entries to the next function symbol have the same length as before but different entry-byte hashes; those fragments do not represent the whole asynchronous function. Keyboard and mouse functions also moved. The full mapping table is in the JSON. **Old pseudo-code must not be treated as evidence for the new version merely because an address is unchanged**; the old focus research remains limited to the old service hash. This round did not re-port the whole ViewBridge/focus-suppression state machine.

## Reproduce and failure records

```sh
# read-only check whether the install drifted from the saved baseline; exit code 1 on change
node scripts/reference-baseline.mjs --check

# generate a new manifest for the next investigation; the old one stays in Git history
node scripts/reference-baseline.mjs --previous docs/original-baseline.json --output artifacts/next-reference.json

# automatic verification of the same scenario with the independent build; owned windows only
node scripts/reference-behavior-test.mjs --independent
npm test

# original: prepare the read-only controller, then operate the owned bundle printed by a normal cua_repl session
node scripts/reference-behavior-test.mjs --cursor-owner ORIGINAL_SERVICE_PID
```

The original controller accepts JSON checkpoints on stdin: nav, type, selectAll, top, drag, scroll, capture, click, setValue, selectText, then finish. Each checkpoint should be sent after the matching original action and AX observation complete, and `capture` must carry the actual byte signature, length, width and height. JPEG dimensions cannot be read with PNG offsets. Drag, scroll and click points must be derived from the new screenshot scale and must not copy screen coordinates from another setup. Original real input is only sent through legitimate `cua_repl`; the controller has no private RPC or original-module dependency.

The observer runs for at most 180 seconds and the controller times out at 230 seconds, saving failure and cleaning up; an action outside the observation window cannot count as an isolation pass. Observer deadline configuration, controller stdin exit and a wrong PNG assumption were found and fixed during testing, and the original records are retained in the artifacts directories listed in the JSON. A later independent retest hit a CG/AX coordinate disagreement at startup binding with zero target keyDown/mouseDown and is retained as a failure; the earlier 10/10 result for the same scenario is stored separately. The reference window polling-interval metadata was also corrected without rewriting the raw traces. The first round's logical-coordinate drag failure is also retained; the pixel-coordinate experiment is counted separately, and old failures were not turned into successes.

Raw slices, disassembly, REA results and complete run records remain in ignored directories. Commits contain only independent scripts, metadata and factual summaries, and distribute no original modules, machine code or credentials. The v1.0.0 tag and existing release packages are not moved or overwritten; this is a follow-up baseline commit.
