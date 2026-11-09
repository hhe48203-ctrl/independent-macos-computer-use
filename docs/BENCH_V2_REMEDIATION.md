# Bench v2 failure reproduction

[中文版本](zh-CN/BENCH_V2_REMEDIATION.md)

The fixed comparison baseline is `artifacts/bench-v2-full-20261109T044031Z/results.json`. It contains 90 scored trials and six infrastructure attempts. Reproductions use Pi, OpenAI OAuth and GPT-6.1 Terra at `low` with the pinned upstream fixture, checker and A22 rules. The current work uses individual replicate indices and leaves the full matrix for a separate acceptance run.

| Item | Before | Current evidence |
| --- | --- | --- |
| Journal and exact seed | The CLI could not select a replicate or resume, and the baseline used temporary scripts | `690d3b2` adds `--run-index` and recovery from atomic trial records. A resume of the three scored reproductions created no new trial directories. Tests retain provider failures and incomplete attempts separately and reject duplicate scores or changes to run identity |
| Hardware idle | IR-03 `410255` stopped after 11.84 s with zero sentinel HID events | `8f2a37d` and `5b43217` require stable HID counters and a fresh tickle from the exact helper and Pi ancestry. The trace showed Pi's MCP server in a separate process group. The next three targeted trials scored, including the real MB-09 focus failure. An unknown reset and physical counters still interrupt |
| Multi-app preflight | G04 `482045` could not load `libllhttp` in the Homebrew Node selected for its archive service. The pinned adapter also ignored `ready.url` | `d350b4e` uses the selected Node for MCP, fixture launch and evaluation and checks locked Electron builds, stock executables, ports and service readiness. The same seed's archive reset, verifier and owned `/healthz` check passed. This is a startup check |
| IR-04 `816494` | Checker 0.45. The WebKit text field reported `focused:true` in the window tree while the inactive app exposed no application-level text focus. An unfocused AX setter could return success with the value still empty | The final trial used `typeText` with the current field index after dismissing consent and focusing the field. Verified AXValue insertion, one submission with the expected values, checker 1.0 and A22 8/8. One focus precondition stopped typing while the consent overlay was present |

The three pre-fix reproductions and the no-op resume are in `artifacts/bench-v2-pi-20261109T061549001410Z/summary.json`. The final IR-04 direct-path result is in `artifacts/bench-v2-pi-20261109T062212995745Z/summary.json`. Earlier failed and recovery attempts remain in their original directories. The source trace is in `artifacts/bench-v2-mb09-source-trace-1794204883344509000/trace.jsonl`, and the G04 startup check is in `artifacts/bench-v2-g04-service-1794204864501260000/report.json`.

| Open work | What the existing rows establish |
| --- | --- |
| MB-09 `790113` | `drag_begin` preceded the first sentinel key-loss sample by about 45 ms in the reproduction. The checker recorded no drop, and A22 failed key focus and typing. Ordinary mouse-drag packet delivery does not establish safe AppKit drag-session behavior |
| IR-01 `147201`, `517139` and IR-02 `487371` | Next/sheet presentation and popup-menu tracking are separate paths. Driver stacking errors and A22 interference need individual event and window-order comparisons |
| IR-03 `410255` | The model clicked the static text inside an AX table row. The window rose and the fixture recorded a title edit with no selection switch or save prompt. Test semantic row selection before changing dialog handling |
| MB-10 `227159` and MB-11 `160721` | The foreground condition still used the background driver, and overlay movement cannot cause native hover or tooltip tracking. Real hover needs an explicit foreground operation and a capture path that can read the resulting tooltip |
| CDB-G02 `909557` and CDB-G03 `99589` | The model bound chat/calendar in G02 and mail/Calc in G03. It did not bind the workbook in G02 or GnuCash in G03. These rows locate incomplete workflows without proving that those applications reject driver input |
| CDB-G04 `482045` | The scored row attempted a workspace log URL through Chrome and produced no matching task evidence. Test the permitted GUI route to the workspace log and archive before attributing the incomplete outcome to input delivery or model strategy |
