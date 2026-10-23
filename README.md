# Independent macOS Computer Use MCP

[中文版本](docs/zh-CN/README.md)

An independent Computer Use MCP server that runs locally. The agent uses only two entry points, `js` and `js_reset`, and calls `cua` plus app objects inside a persistent JavaScript REPL. A Swift helper provides Accessibility, ScreenCaptureKit, Vision OCR, background input, and a visible, click-through, non-focus-stealing independent cursor.

v1.1 adds the original coordinate-compatibility mode, modifier clicks/timed keys, vertical scroll calibration and explicit reconnection while keeping the persistent REPL and cursor interface. Running it needs no Codex, `@oai/sky`, original service, OpenAI API key or REA. The research used [REA](https://github.com/morluto/rea); the deliverable contains no original proprietary modules, binaries or image assets, and does not modify the original app or the system permission database.

## Build and start

Building from source needs macOS 14.4+, Node.js 22+ and Xcode Command Line Tools. Verified on macOS 26.6.2 arm64 with Node 24.15.0. Prebuilt packages need only macOS and Node, with no compiler or `npm install`. Other systems/architectures are not machine-verified.

```sh
npm ci --ignore-scripts
npm run build
npm run doctor
node /absolute/path/to/computer_use_mcp/src/server.mjs
```

The last command starts the MCP stdio service and waits for client JSON-RPC input; it is not an interactive terminal. stdout stays protocol-only. Grant Accessibility and Screen Recording to the launching terminal/agent/helper normally, and re-run doctor after changing the launch chain. This project cannot grant TCC on the user's behalf. The build refuses to overwrite a helper that is still running; close its client first or choose a separate `CU_BUILD_DIRECTORY`.

## Agent interface

`js` takes `{code,timeout_ms?,title?}` and `js_reset` takes `{}`. `cua` and `nodeRepl` are already initialized; top-level `await`, `var`/`let`/`const` and app objects persist across calls.

```js
let state = await cua.getState();
let app = await cua.getApp({pid:123,windowId:456}); // choose from the real inventory
```

The next `js` call keeps using the same app:

```js
await app.getAXStateAndScreenshot();
// act on the newest observed index: await app.click(7)
// await app.typeText('你好'); await app.pressKey('CMD+A')
```

Observations automatically display AX text/diffs and MCP images. `emit:false` only returns the content. When porting original scripts use `cua.getApp(reference,{coordinateMode:"original"})`, which keeps screenshot-pixel coordinates after AX-only observation; every observation reports its unit, scale and range explicitly. `app.reconnect()` previews candidates and returns a new binding after an explicit PID/window choice. Full methods, screenshot-coordinate rules and differences are in [JS API](docs/JS_API.md). Await every desktop operation; an asynchronous callback that fires after the call ends cannot keep acting on the desktop. A timeout, cancellation or reset clears bindings and stops native input, and side effects already delivered are not rolled back. The REPL is a trusted local Node.js process, not a security sandbox.

The cursor is drawn independently from a reference style: a light outline, translucent arrow and soft glow, moving with continuous ease-in/ease-out and delivering input only after arrival. Drag positions follow real event packets; the system pointer never moves. It cannot become key/main, is click-through and follows window movement; size changes, target close, reset, disconnect and idle timeout hide it. Text operations point at an element centre and do not claim a measured insertion point. The default style is now an amber ring reticle so it cannot be mistaken for Codex's own pointer; `CU_AGENT_CURSOR_STYLE=arrow` restores the translucent arrow described above.

## MCP clients and pi

Plain stdio configuration:

```json
{"mcpServers":{"macos-computer-use":{"command":"/absolute/path/to/node","args":["/absolute/path/to/computer_use_mcp/src/server.mjs"]}}}
```

`mcp.json` serves local plugin clients that support PLUGIN_ROOT; the [SDK example](examples/mcp-client.mjs) shows real calls.

```sh
node scripts/setup-pi.mjs
pi --approve --extension builtin:mcp
npm run test:pi
```

setup only writes this project's `.pi/mcp.json` and never touches global configuration or credentials. On the verified macOS 26.6.2 arm64 the real-event route can be enabled explicitly with `node scripts/setup-pi.mjs --background-events`; it is off by default. The basic pi acceptance completed the Chinese input loop in only 5 js calls; another 9 js calls completed 7 real document event operations including shortcuts, Chinese/emoji, selection drag, scrolling and raw clicks.

## Capabilities and limits

Background operation does not activate apps, move the system pointer or fall back to the foreground by default. The target may be fully covered but must be on the current unlocked desktop and not minimized. AXPress and verified AX text are preferred by default. Real mouse/keyboard events are an optional path that depends on undocumented system behavior such as CGEventSetWindowLocation, so apps may ignore them or reorder themselves; isolation errors must stop and re-observe. The experimental app-local AppKit focus route is verified only on the specified local version and cannot promise arbitrary-app compatibility.

`CU_ALLOWED_BUNDLE_IDS` restricts apps, and an empty value rejects every target; that mode disables display capture. `CU_AGENT_CURSOR=0` disables the visible overlay. The cursor defaults to the amber ring reticle (distinguishable from Codex's own pointer); `CU_AGENT_CURSOR_STYLE=arrow` restores the v1 light arrow. Ordinary screenshots exclude the cursor, and `cua.getScreenshot({region,includeAgentCursor:true})` is available for visual verification.

There are currently no browser APIs and no rich-text paste; unsupported options fail explicitly. Plain-text paste uses AX insertion and needs no clipboard. Only one physical Retina display was measured, and multi-display coordinate-formula tests are not equivalent to real multi-display acceptance. Lock screen, hidden desktops, TCC bypass and credential extraction are not included.

## Verification and packaging

```sh
npm test
npm run test:desktop
npm run test:cursor
npm run test:input-options
npm run test:reconnect
npm run test:scroll
node scripts/repl-document-test.mjs
npm run test:pi
npm run test:pi:document
npm run package
```

Desktop tests only operate temporary owned AppKit windows. Native event tests explicitly enable the locally verified experimental focus route. Human concurrent-use tests must coordinate a start time; automated scripts cannot replace human input integrity.

`artifacts/` keeps local test results and failure records and is not committed by default. `dist/` produces the prebuilt plugin ZIP, the source package and SHA-256 values; packaging must verify that the worker and helper run outside the repository. v1.0 passed a human input-method/case-switch comparison; the v1.1 feature acceptance scope is described below and added no new human long-hold concurrent acceptance; the first failure and its later correction are kept separate. Out-of-repository packaging verification is in docs/VALIDATION.md. Old v0.3 results are not new-version acceptance.

Architecture and research: [REPL/cursor evidence](docs/REPL_CURSOR_RESEARCH.md), [native background mechanisms](docs/FOCUS_FIDELITY.md), [original reverse-engineering record](docs/REVERSE_ENGINEERING.md). The latter two contain v0.3 historical interface names; the current public interface is defined by the JS API.

The original baseline was refreshed on 2026-10-22 to App 26.1016.61520 and sky 0.7.12. Interface differences, the original's 9/10 versus the independent 10/10 behavior results, the re-derived Unicode function and reproduction commands are in the [current original baseline](docs/ORIGINAL_BASELINE.md); that page keeps the v1.0 historical comparison. The v1.1 implementation, multi-window/multi-app scroll data, original raise failures and new-interface examples are in the [compatibility acceptance](docs/COMPATIBILITY_V1_1.md). The existing v1.0.0 tag stays.
