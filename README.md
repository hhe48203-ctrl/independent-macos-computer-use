# macOS Computer Use MCP

[中文版本](docs/zh-CN/README.md)

Script macOS apps from a persistent JavaScript session — through just two MCP tools.

Variables, functions, and app handles persist across tool calls. Observe a window in one call, then continue working with the same objects in the next. A native Swift helper provides Accessibility trees, screenshots, OCR, and background-first interaction.

Inspired by Codex-style JavaScript computer-use sessions. Independent implementation; not an official Codex integration. Runs as a trusted local Node.js process, not a security sandbox.

## Two tools, one session

The public server exposes only `js` and `js_reset`. `cua` and `nodeRepl` are already initialized. Top-level `await`, `var` / `let` / `const`, functions, and app objects remain available on the next `js` call.

| Tool | Arguments | What it does |
| --- | --- | --- |
| `js` | `{code, timeout_ms?, title?}` | Evaluates `code` in the persistent Node.js REPL. `timeout_ms` is optional, defaults to 30000, and must be an integer from 100 through 120000. |
| `js_reset` | `{}` | Stops in-flight JavaScript and native input, hides the agent cursor, and clears lexical bindings and app objects. |

Observations automatically include Accessibility text or a diff, plus MCP image blocks when a capture is returned. Pass `emit:false` to return the value without that display. Methods, coordinate rules, and the cursor are specified in the [JS API](docs/JS_API.md).

### What survives, and what a failure clears

- A normal thrown error keeps the bindings that already exist. Redeclaring an existing `let` or `const` raises a `SyntaxError`.
- `js_reset`, a timeout, client cancellation, process exit, or an output or memory limit rebuilds the session. Those paths drop variables, functions, and app objects and stop native input from that session.
- Clicks, keystrokes, and text that already reached an app are not rolled back.
- Await every desktop operation. A callback that runs after the `js` call has finished cannot perform desktop operations on a later call.
- A call returns at most 8 MiB or 256 blocks. Console and worker stdout stay off the MCP protocol stdout.

## Requirements

Building from this checkout needs:

- macOS 14.4 or later, plus Xcode Command Line Tools, to compile the Swift helper
- Node.js 22 or later

Recorded verification is macOS 26.6.2 arm64 with Node.js 24.15.0. Other operating systems and architectures are not machine-verified. `npm run package` can produce a local plugin ZIP that needs macOS and Node.js and does not need a compiler or `npm install`. This repository has tags `v1.0.0` through `v1.3.0` and does not publish GitHub Releases. Acceptance of those local packages is in [validation](docs/VALIDATION.md).

Grant Accessibility and Screen Recording in System Settings to the terminal, agent, or helper that actually launches the server. This project cannot change the TCC database for you. After the launch chain changes, run doctor again.

The server process has the desktop privileges of the user who started it. It is a trusted local Node.js process, not a security sandbox, and it should only evaluate JavaScript from an agent you trust.

## Install, build, and doctor

From a checkout of this repository. The examples use `macos-computer-use-mcp` as the checkout directory; if the cloned directory name differs, substitute that path.

```sh
npm ci --ignore-scripts
npm run build
npm run doctor
node /absolute/path/to/macos-computer-use-mcp/src/server.mjs
```

`npm run doctor` asks the built helper for status and prints JSON. It does not prompt for, or grant, permissions. The last command starts the MCP stdio server and waits for client JSON-RPC. It is not an interactive shell, and stdout stays protocol-only. `npm start` runs the same `src/server.mjs` entry. The build refuses to replace a helper that is still running; close that client or choose another `CU_BUILD_DIRECTORY`.

## MCP client configuration

Point a stdio MCP client at the Node.js binary and this checkout:

```json
{
  "mcpServers": {
    "macos-computer-use": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/macos-computer-use-mcp/src/server.mjs"]
    }
  }
}
```

[`mcp.json`](mcp.json) is the same server for local plugin clients that expand `PLUGIN_ROOT`. [`examples/mcp-client.mjs`](examples/mcp-client.mjs) shows a direct SDK session. The optional pi setup writes only this project's `.pi/mcp.json` and does not touch global configuration or credentials:

```sh
node scripts/setup-pi.mjs
pi --approve --extension builtin:mcp
```

That setup leaves synthetic AppKit activation off, including when the legacy `--background-events` flag is passed. `--experimental-appkit-focus` is the explicit opt-in for the older activation route. See [input isolation](docs/INPUT_ISOLATION.md).

## Persistent session

The first `js` call reads the live inventory and binds one window. `state.windows` entries include `pid`, `windowId`, `title`, `app`, `bundleId`, `path`, `frame`, and `onScreen`. `cua.listWindows()` returns that window array by itself. Copy one real pair. The constants below are placeholders, not a window on your Mac.

```js
const state = await cua.getState();
const EXAMPLE_PID = 123;        // replace with state.windows[].pid
const EXAMPLE_WINDOW_ID = 456;  // replace with the matching state.windows[].windowId
let app = await cua.getApp({pid: EXAMPLE_PID, windowId: EXAMPLE_WINDOW_ID});
```

A bundle id such as `cua.getApp("com.apple.calculator")` works only when it matches exactly one window. Zero or several matches throw, and `getApp` does not launch the app.

The next `js` call is the same REPL, so `app` is still that object:

```js
await app.getAXStateAndScreenshot();
const EXAMPLE_ELEMENT_INDEX = 7; // replace with an index from that latest observation
await app.click(EXAMPLE_ELEMENT_INDEX);
```

Element indexes refer to the latest observation on that app object. They are not stable ids across observations. `await app.typeText("...")` and `await app.pressKey("CMD+A")` are the same session as well. `coordinateMode:"original"` is an explicit coordinate-mapping option for porting scripts; it is not a claim that every other behavior matches another product. Details are in the [JS API](docs/JS_API.md).

## Configuration and limitations

Background operation does not activate the target, move the system pointer, or fall back to the foreground by default. The window may be fully covered. It still has to be on the current unlocked desktop and not minimized. Lock screen, other Spaces, and hidden desktops are outside the supported guarantees. Default actions prefer `AXPress` and verified Accessibility text. Real mouse and keyboard events are optional and depend on undocumented system behavior, including `CGEventSetWindowLocation`. An app may ignore those events or reorder its own windows. An isolation error stops the operation so the caller can observe again.

`CU_ALLOWED_BUNDLE_IDS` limits which apps can be targeted. An empty value rejects every target and disables display capture. `CU_AGENT_CURSOR=0` hides the overlay. `CU_AGENT_CURSOR_STYLE` is `ring` (default) or `arrow`. `CU_AGENT_CURSOR_VISIBILITY` is read when the helper starts: `target` (default) hides or clips the glyph when the anchor is covered, and `always` keeps the earlier progress overlay. Motion and background input continue while the glyph is hidden. Ordinary screenshots omit the cursor; `cua.getScreenshot({region, includeAgentCursor:true})` can include it for a visual check. See [cursor visibility](docs/CURSOR_OCCLUSION.md).

The experimental app-local AppKit focus route is off unless `CU_EXPERIMENTAL_APPKIT_FOCUS=1` or the pi flag above is set. It was verified on the recorded macOS 26.6.2 arm64 machine and is not a promise about arbitrary apps. There is no browser API and no rich-text paste; unsupported options fail explicitly. Plain-text paste uses Accessibility insertion and does not use the clipboard. Only one physical Retina display was measured. Multi-display coordinate-formula tests are not multi-display acceptance. TCC bypass and credential extraction are not part of this project.

## Development, validation, and license

The [documentation index](docs/README.md) lists the [JS API](docs/JS_API.md), [architecture](docs/ARCHITECTURE.md), [validation](docs/VALIDATION.md), [development status](docs/DEVELOPMENT_STATUS.md), and [release notes](docs/RELEASE_NOTES.md). `npm run check:docs` checks relative links and the Chinese counterparts under [docs/zh-CN](docs/zh-CN/README.md).

```sh
npm test
npm run test:desktop
npm run test:cursor
npm run test:input-options
npm run test:reconnect
npm run test:scroll
node scripts/repl-document-test.mjs
npm run check:docs
npm run test:pi
npm run test:pi:document
npm run package
```

Desktop tests drive temporary owned AppKit windows. Native event tests explicitly enable the experimental focus route. A human concurrent-use check needs a coordinated start; an automated script does not replace that. `artifacts/` holds local results and is not committed by default. Out-of-repository packaging checks are described in [validation](docs/VALIDATION.md). v1.3 cursor visibility, the v1.2 cooperative input profile, and the v1.1 coordinate, modifier, scroll, and reconnect work are recorded there and in the release notes. The existing `v1.0.0` tag stays.

Running the server does not require Codex, `@oai/sky`, an original service, an OpenAI API key, or [REA](https://github.com/morluto/rea). Research used REA. The deliverable contains no original proprietary modules, binaries, or image assets, and it does not modify another app or the system permission database. Interface differences measured against a local install are kept in the [original baseline](docs/ORIGINAL_BASELINE.md), with mechanism notes in [focus fidelity](docs/FOCUS_FIDELITY.md) and the [reverse-engineering record](docs/REVERSE_ENGINEERING.md). Those research pages include historical interface names; the public tools are only `js` and `js_reset`.

This documentation pass does not rename distribution identifiers. `package.json`, `plugin.json`, and the MCP server name remain `independent-macos-computer-use` (`package.json` is `"private": true`). The npm bin is `macos-computer-use-mcp`. The GitHub repository slug is still `independent-macos-computer-use` until a repository admin renames it.

Licensed under [MIT](LICENSE).
