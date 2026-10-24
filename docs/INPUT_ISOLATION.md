# Input-method and window-order investigation

[中文版本](zh-CN/INPUT_ISOLATION.md)

2026-10-24, macOS26.6.2 arm64. The installed reference is now Codex26.1021.31345, sky0.7.13, native SHA256 `47ad8bdd901e4e55de649c319e8590eda3308f5f69c11d75486e13bd90bedeb7`. This is a new installed identity; old native addresses and earlier successes are not treated as new-version evidence.

## What is established

The independent experimental AppKit route can activate the **target's text input context even while system keyboard focus stays elsewhere**. Instrumentation in disposable owned apps observed `NSTextInputContext.activate`, called through AppKit's `currentInputContext_withFirstResponderSync:` and `NSApplication.updateWindows`. `TSMGetActiveDocument()` changed from nil to a target document and returned to nil after cleanup. A 600ms key hold kept the synthetic scope open about664ms, compared with about66ms for the zero-hold case.

The component experiment tested all eight combinations of application-active notice, observed AX activation-point click, and key-focus notice, in both accessory and regular AppKit fixtures. The application-active notice **plus activation-point click** activated the text input context; the other combinations did not. Real Right-key movement still worked in all cases. These are owned-app causal observations, not proof of the unique cause of the historical human IME complaint.

Input-source/modifier sampling did not establish a persistent global stuck modifier. Such sampling cannot rule out every transient. The earlier animation fix shortened the synthetic scope, but did not remove input-context activation itself. Foreground/key-focus queries alone therefore do not establish IME isolation.

In an original-tool run, the owned target actually received **AX Raise**: its stack was `accessibilityPerformRaise → makeKeyAndOrderFront → order`, entered through the accessibility server. The target gained real foreground/key focus in142 samples (maximum sampling gap about36.5ms). Original-service event source PID7749 was present in that interval. The receiver stack identifies the raising mechanism; it does **not** identify the AX client's audit token or fully trace the original's internal decision branch. A later run separating six scroll calls from AX observation did not raise. The condition is intermittent; ordinary scrolling is not claimed to always issue Raise.

## Changes and practical avoidance

`setup-pi.mjs` now separates real event delivery from synthetic activation. Its default and the legacy `--background-events` argument configure `CU_EXPERIMENTAL_APPKIT_FOCUS=0`, including migration from the old generated value1. The local project configuration has been migrated. Unrelated server environment entries are retained. Only `--experimental-appkit-focus` opts back into the old route. This changes the local MCP configuration, not global input sources, permissions or the original app.

For concurrent use, prefer verified AX text insertion, `pressKey('CMD+A')`, `selectText(...)`, and ordinary `click(index)` (AXPress when available). Real navigation keys, verified Unicode events, scroll and EventPad drag were also exercised without synthetic activation. An eleven-phase regular-AppKit trace recorded **zero input-context activations/deactivations and zero window-order calls**, with the target covered throughout. A separate seven-operation document workflow and pi's actual MCP workflow verify the resulting content and selection.

Inactive AppKit apps can ignore some **raw menu shortcuts and text-selection drags**. The no-activation test caught ignored real CMD+A and text drag; these remain failed attempts. The cooperative workflow uses the existing semantic equivalents instead. Full raw modifier/drag/hold tests retain the explicit experimental route. There is no silent retry with activation or foreground fallback, and arbitrary canvas/app support is not promised.

`cua.status().background` reports `experimentalAppKitFocus`, `appKitFocusPolicy`, and `AXRaiseRequestsInBackground:false`. The latter means the helper does not request AX Raise in background mode; the target app can still raise its own UI. Order/focus checks detect and stop after an observed violation; detection is not prevention of every transient. The original public cua_repl API exposes no documented parameter promising never to activate/Raise. This project does not patch its service or restore windows/focus afterward.

## Validation and limits

```sh
npm run test:focus                  # owned regular app, no synthetic activation
npm run test:document:cooperative  # semantic equivalents where needed
npm run test:pi:document            # actual pi MCP client, activation disabled
node scripts/focus-ablation-test.mjs --regular
# Intentional original observation: only the legitimate cua_repl supplies input
node scripts/focus-original-controller.mjs
```

The diagnostics replace public input-context methods **only inside disposable owned fixtures**, calling each original implementation once; NSWindow overrides record their normal superclass calls. They are not linked into the production helper and never instrument Codex/other apps. Input-source IDs, flags, TSM identifiers and stacks are recorded; foreground drafts and keyboard text are not read. A diagnostic-only owned-window switch can reject Raise for further controls; this is not a general MCP prevention technique.

The fixture scheduler previously had a ps-check/compile race. Tests now hold an atomic process-shared lease across fixture lifetime, including nested replacement; builds refuse a leased output directory. A second-process rejection and normal release are regression-tested. One overlapping run was explicitly reclassified inconclusive. Ambiguous/missing test text, ignored inactive raw actions and pi's initial post-verification JavaScript errors also remain failed records; subsequent passes do not rewrite them.

The participant then completed the cooperative comparison: 10.001s idle and 20.551s background, separated by the coordinated start wait. Thirty background operations created zero synthetic AppKit sessions. Both phases recorded Canadian/SCIM source switching; Caps Lock/Globe states were recorded in the background phase. Of76 background-interval key-down metadata records,62 were human-source events targeting Codex and14 were helper events targeting the owned app. The participant reported “both phases normal, no window raising” and accepted the problem as resolved for this configuration. No foreground draft or exact character readback was performed. This single-user acceptance does not extend to arbitrary apps or experimental long holds. The exact original Raise-decision condition and the unique historical IME cause remain open. Compact measurements and paths are in [input-isolation-evidence.json](input-isolation-evidence.json); the earlier [v1.1 comparison](COMPATIBILITY_V1_1.md) and [v1 human record](VALIDATION.md) remain historical evidence.
