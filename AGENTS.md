# Working on the repository

[中文版本](docs/zh-CN/AGENTS.md)

## Setup and checks

- Use Node.js 22 or later and install with `npm ci --ignore-scripts`.
- Run `npm run check` for portable JS tests, including the documentation checks. This needs no native helper or desktop permissions. List new macOS-only test files in `scripts/check.mjs`.
- Run `npm run check:native` for Swift or native bridge changes. It builds into `.build` and runs the full Node regression suite on macOS with Xcode Command Line Tools. Use a separate checkout if an MCP client is using the current helper.
- Use `npm run doctor` to inspect the built helper and its macOS permissions. For desktop behavior, choose the relevant `npm run test:*` command from [the README](README.md#development-validation-and-license). Use owned fixtures and run desktop tests one at a time on an unlocked, authorized desktop. Benchmarks and human trials need a reserved desktop.
- Report the checks run and any coverage gaps. Offscreen tests, live desktop tests, and human concurrent-use trials each cover different behavior. Verify actual release archives using [the release evidence guide](docs/VALIDATION.md).

## Code map and invariants

- `src/server.mjs` exposes `js` and `js_reset` over MCP stdio. Keep stdout reserved for protocol traffic.
- `src/repl.mjs` and `src/repl-worker.mjs` own evaluation and session lifetime. `src/bridge.mjs` supervises the Swift helper. Cancellation, timeout, and reset must retire pending native work. After an interrupted mutation, observe the target again before retrying.
- `src/cua.mjs` implements app/window bindings and coordinate handling. `src/tools.mjs` validates native requests. Reject ambiguous targets and stale snapshots or coordinates. Keep behavior aligned with the [JS API](docs/JS_API.md).
- `native/` owns macOS Accessibility, capture, input, and the cursor overlay. Preserve background routing by default, require explicit foreground opt-in, and use normal macOS permission grants. See [architecture](docs/ARCHITECTURE.md).

Update the Chinese counterparts of changed bilingual docs. Keep local artifacts and research out of commits. Initialize Git for new projects and commit changes by feature. Create a release tag after that version passes acceptance.
