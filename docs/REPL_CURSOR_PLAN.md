# cua REPL and independent cursor goals

[中文版本](zh-CN/REPL_CURSOR_PLAN.md)

Provide a persistent JavaScript experience close to the original on the existing independent macOS backend, without depending on the original runtime, private sockets, authentication or proprietary code.

## Acceptance requirements

- Expose only JS execution and reset to the agent; remove the 17 explicit legacy tools. Legacy native methods remain an internal backend only.
- Top-level `await`, `var`/`let`/`const` and app objects persist across executions, and errors are recoverable. Infinite loops, timeouts, cancellation and reset have bounded cleanup, and a stale execution may not keep acting after reset.
- `cua.getState()`/`getApp()` plus object methods for observing, screenshotting, clicking, typing, pressing keys, scrolling, dragging and selecting are available, with explicit window binding, identifiers and screenshot-coordinate behavior.
- First-use documentation hints, AX state/diffs, automatic state output and rich screenshot content are verified for real.
- The native visible agent cursor shows actual coordinates, clicks and drags; it follows window movement, screen/screenshot scale and multi-display coordinates without moving the user's pointer, tapping input or activating windows.
- The cursor is cleaned up on cancellation, reset, disconnect and target close; whether screenshots include it has defined behavior and verification.
- pi completes a real desktop task only through the new interface, including the visible cursor and human concurrent-use acceptance.
- Documentation, sources and prebuilt packages all use the new interface, verified by running outside the repository, with known limits and failure evidence retained.
- Commit per feature in Git; tag v1.0.0 only when everything is complete.

## Implementation order

1. Check the observable contract of the original JS/runtime and cursor implementation, recording facts and inferences.
2. Implement the independent persistent REPL, cua/app objects, rich output and the two MCP entry points; verify with real lexical bindings and error recovery.
3. Implement the native, click-through, nonactivating independent cursor and operation progress; verify movement, resize, click and drag.
4. Run real-application, pi, concurrent-use and packaging acceptance on the new interface, update documentation and publish the tag.

Development baseline: 756b043 (v0.3.0). The new interface, cursor, pi and human comparison are now complete; final out-of-repository package checks and verifiable limits are in VALIDATION.md. A single-machine test is not extrapolated into arbitrary-application or multi-display compatibility.
