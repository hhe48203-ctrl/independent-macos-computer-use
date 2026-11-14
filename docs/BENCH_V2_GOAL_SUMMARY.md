# Bench v2 before-and-after summary

[中文版本](zh-CN/BENCH_V2_GOAL_SUMMARY.md)

This page compares the Cua Driver Bench v2 repair goal against the frozen baseline. The replays cover a few same-seed trials under different conditions, so they show per-seed changes and are not a full acceptance run. Detailed evidence is in [Bench v2 failure reproduction](BENCH_V2_REMEDIATION.md).

## Outcome

Of the 9 replayed background seeds, 4 are full passes (task pass, GUI-only and all eight A22 criteria): G02, G04, IR-03 and IR-04. None of these 9 seeds was a full pass in the baseline. In the foreground condition, one seed each of MB-10 and MB-11 rose from 0.10 and 0.05 to 1.00. MB-09, IR-02 and G03 kept their scores. IR-01 `147201` kept its score while A22 fell from 8/8 to 4/8, because the fixture activated itself when opening its native sheet and took the witness focus. Every replayed trial satisfied GUI-only. The other 35 baseline seeds were not replayed.

## Conditions

| Item | Baseline | Replays |
| --- | --- | --- |
| Data | `artifacts/bench-v2-full-20261109T044031Z/results.json` in the original `computer_use_mcp` checkout, 90 scored trials plus 6 infrastructure interruptions | The latest scored trial per task, condition and seed in this worktree's `artifacts/bench-v2-pi-*/summary.json` |
| Size | 8 background and 10 foreground tasks, 5 seeds each | 9 background and 2 foreground seeds, one trial each |
| Model | Pi 1.5.0, `openai-codex/gpt-6.1-terra`, thinking `low` | Same model. Thinking `high` except IR-01 `517139` |
| Driver mode | Project commit `90e3501`, before `--public-api-only` existed | `--public-api-only` except IR-01 `517139`. Undocumented focus queries, raw background pointer delivery and experimental AppKit routes are disabled |
| Code | Fixed at `90e3501` | The commit current at each trial, from `861dc04` to `c120c1f`, listed below |
| Prompt | Pinned upstream task prompts | The same prompts plus runner guidance injected by fixture bundle ID, such as Calc write verification, Daymark event editing and per-case Rillwatch saves. The guidance contains no task answers, but each fixture app belongs to one task, so it acts much like per-task tuning |
| Unchanged | Pinned upstream commit `22a67ea`, fixtures, checkers, A22 policy, 360 seconds and 45 calls per trial | Same |

Score changes therefore mix driver repairs, reasoning effort, runner guidance and single-trial variance. They cannot be attributed to the driver alone.

## Per-task comparison

A22 is scored only in the background condition and is shown as criteria passed out of 8. Foreground trials have no A22 score. "Pass" under GUI-only means no violation. "Full" means task pass, GUI-only pass and, in the background condition, all eight A22 criteria.

| Condition | Task | Baseline over 5 seeds: mean · task pass · A22 8/8 | Replayed seed | Baseline same seed: score · A22 · GUI-only | Latest replay: score · A22 · GUI-only · full | Replay directory (thinking, mode, commit) |
| --- | --- | --- | --- | --- | --- | --- |
| Background | MB-09 | 0.05 · 0/5 · 0/5 | `790113` | 0.05 · 6/8 · pass | 0.05 · 8/8 · pass · no | `20261114T064558370743Z` (high, public API, `eb9700b`) |
| Background | IR-01 | 0.33 · 0/5 · 2/5 | `147201` | 0.15 · 8/8 · pass | 0.15 · 4/8 · pass · no | `20261114T065429236501Z` (high, public API, `c120c1f`) |
| Background | IR-01 | Same | `517139` | 0.45 · 5/8 · pass | 0.45 · 8/8 · pass · no | `20261113T012423376072Z` (low, not public-API mode, `861dc04`) |
| Background | IR-02 | 0.56 · 1/5 · 1/5 | `487371` | 0.45 · 5/8 · pass | 0.45 · 8/8 · pass · no | `20261114T065429236501Z` (high, public API, `c120c1f`) |
| Background | IR-03 | 0.40 · 0/5 · 0/5 | `410255` | 0.40 · 7/8 · pass | 1.00 · 8/8 · pass · yes | `20261114T015856177473Z` (high, public API, `35be662`) |
| Background | IR-04 | 0.55 · 2/5 · 5/5 | `816494` | 0.45 · 8/8 · pass | 1.00 · 8/8 · pass · yes | `20261114T064824146323Z` (high, public API, `f6c4b50`) |
| Background | CDB-G02 | 0.20 · 0/5 · 5/5 | `909557` | 0.20 · 8/8 · pass | 1.00 · 8/8 · pass · yes | `20261114T062427582654Z` (high, public API, `a654a8a`) |
| Background | CDB-G03 | 0.45 · 0/5 · 5/5 | `99589` | 0.45 · 8/8 · pass | 0.45 · 8/8 · pass · no | `20261114T063632426557Z` (high, public API, `a3992bc`) |
| Background | CDB-G04 | 0.15 · 0/5 · 5/5 | `482045` | 0.15 · 8/8 · pass | 1.00 · 8/8 · pass · yes | `20261114T063342722365Z` (high, public API, `4aed16a`) |
| Foreground | MB-10 | 0.10 · 0/5 · n/a | `227159` | 0.10 · n/a · pass | 1.00 · n/a · pass · yes | `20261114T064355337470Z` (high, public API, `3d6fa49`) |
| Foreground | MB-11 | 0.05 · 0/5 · n/a | `160721` | 0.05 · n/a · pass | 1.00 · n/a · pass · yes | `20261114T064355337470Z` (high, public API, `3d6fa49`) |
| Foreground | MB-09 | 0.05 · 0/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | IR-01 | 1.00 · 5/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | IR-02 | 1.00 · 5/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | IR-03 | 0.40 · 0/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | IR-04 | 0.67 · 2/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | CDB-G02 | 0.20 · 0/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | CDB-G03 | 0.45 · 0/5 · n/a | None | Not replayed | Not replayed | None |
| Foreground | CDB-G04 | 0.15 · 0/5 · n/a | None | Not replayed | Not replayed | None |

All 90 baseline trials and every replay above satisfied GUI-only. Baseline A22 failures were key_focus and typing for MB-09 `790113`; key_focus, window_raised and typing for IR-01 `517139` and IR-02 `487371`; and window_raised for IR-03 `410255`. Among the replays only IR-01 `147201` failed A22, on key_focus, window_raised, typing and activation.

## Same-seed variance

Seeds with several scored trials in this worktree did not give stable results. The table lists them in time order to show the uncertainty of the single trials above.

| Seed | Scored trials (score, A22) |
| --- | --- |
| CDB-G02 `909557` | low: 0.20 (8/8); high without public-API mode: 0.80, 1.00; high public API: 0.65, 0.85, 1.00, all 8/8 |
| CDB-G03 `99589` | low: 0.45 ×3; high without public-API mode: 0.45 ×3, 0.65; high public API: 0.45. All 8/8. The 0.65 depended on experimental AppKit focus and visually checked typing, which public-API mode disables |
| CDB-G04 `482045` | low without public-API mode: 1.00; high public API: 0.15 (reached the 45-call cap), 1.00. All 8/8 |
| IR-01 `147201` | low without public-API mode: 0.45 (8/8) ×2; high public API: 0.45 (8/8), 0.45 (4/8), 0.15 (4/8) |
| IR-02 `487371` | 0.45 (8/8) in all four |
| IR-04 `816494` | 1.00 (8/8) in both high public-API trials |
| MB-09 `790113` | 0.05 (8/8) in both |

Five other replay attempts are unscored infrastructure errors: G02 `909557` twice, G03 `99589` twice (one stopped by the runner because it carried experimental flags), and IR-01 `147201` once at a provider usage limit.

## Repairs

There are 104 commits from baseline commit `90e3501` through `493373c`. The table groups them from the git log and omits documentation-only commits.

| Area | Commits | Effect |
| --- | --- | --- |
| Runner and scoring reliability | `690d3b2`, `8f2a37d`, `5b43217`, `f6c4b50`, `d350b4e`, `192c7ca`, `fa27402`, `3543dcc`, `c5a79f0`, `0e35153`, `8aa64a0`, `64a6d9b`, `eef4fd5`, `5415c89`, `5a79467` | Exact seed replay and resume; separate owned helper activity, hardware input and missing IOKit readings; multi-app runtime preflight; separate recovered provider errors, local turn caps and usage limits; record driver isolation errors; thinking `high`; add `--public-api-only` |
| Public AX semantic input | `caa98b4`, `2fd0b7f`, `328dfd7`, `f943fd0`, `782e6bd`, `d40823f`, `ab29c84`, `0d9d8b7`, `a59ac2a` | Table rows through `AXSelectedRows`; text insertion in inactive web forms; press actionable parents; tabs through `AXSelectedChildren`; `scrollToVisible`; whole-value replacement with observed-value checks; report unchanged AX writes; bind floating dialogs and attached sheets; explicit foreground hover |
| Observation | `34a1faa`, `8a325d9`, `f18ae38`, `97ebbdd`, `f4be717`, `a2b0361`, `055f8c8` | Bounded and structured AX observation, explicit reads on quiet bindings, post-action observations, native snapshot target validation, screenshots without implicit child windows |
| Isolation guards (reject or stop before dispatch) | `76dc681`, `96836c8`, `33c1c65`, `a739f2e`, `d7a70dc`, `4ee532e`, `8917aaa`, `902d383`, `969d733`, `a10f7f8`, `35be662`, `c120c1f`, `493373c` | Stop native popup menu tracking, modified arrows and drags from popups; refuse native row and border drags; stop drags after reordering; stop when the target already owns keyboard focus; detect reordering from new windows; refuse known unsafe popup and ledger actions; refuse explicit menu actions in public-API mode; stop input after witness focus loss in JS and in native delivery |
| Experimental routes (disabled in public-API mode) | `20cc336`, `61d30d4`, `f45667d`, `9ef1445`, `688b33b` | Explicit app-local focus preparation for keys and clicks, directed Unicode with visual checks. Used only for diagnostics and controls outside public-API mode |
| Runner guidance | `3ba092d`, `97142e0`, `9f5e828`, `ad78bd0`, `9ce3a2a`, `2ca8383`, `6c8efba`, `b4b0e64`, `9eec2a7`, `12fc8d4`, `9bb37c8`, `cde687d`, `b625113`, `842675e`, `4aed16a` | Per-fixture GUI steps and save checks that the baseline prompt did not have |
| CI and test infrastructure | `71d491a`, `adbb072`, `fd3a9ae`, `3b4fe54` | Portable and macOS regression checks, lint, cleanup after pointer test failures |

`493373c` is the wrap-up commit. With `CU_PUBLIC_API_ONLY=1` and `CU_BACKGROUND_WITNESS_PID` set, the native helper requires the foreground app and system AX focus to belong to the original witness before background input starts, and otherwise returns `BENCH_WITNESS_FOCUS_CHANGED` without sending input. The benchmark MCP then stops later input as well. It passed `npm run check:native`, but has no live desktop test or Pi replay yet.

## Known limitations

Four limitations remain with public APIs only: MB-09 native row drag-and-drop, G03 GnuCash formal reconciliation, IR-01/02 closed native popup selection, and the reordering and self-activation when IR-01's Next opens a sheet. The first three are refused before dispatch. The fourth cannot be identified in advance; the driver returns an error instead of success, the benchmark stops input for the trial, and A22 scores the measured failure. See [Known limitations with public APIs only](BENCH_V2_REMEDIATION.md#known-limitations-with-public-apis-only) for details and the upstream comparison.

G03 public-API trials also cannot navigate the GnuCash Accounts tree, which exposes only seven AX nodes. The GnuCash preflight identifies reconciliation by the Reconcile control label. It is an application-level rule and contains no task answers.

## Recommended full acceptance

1. Freeze one commit and record `native_sha256` and `code_sha256`. Do not change code during acceptance.
2. On a reserved, unlocked desktop, run the full plan with `--public-api-only`, a fixed thinking level and `--seed 2026`: `npm run bench:v2 -- --run --tasks v2 --condition both --runs 5 --allow-multi-app --public-api-only`, 90 trials in total. Use `--resume` across stages and keep infrastructure attempts separate.
3. Confirm enough OpenAI quota for the whole run before starting. Trials stopped by quota are infrastructure errors to resume later, not scores.
4. Pair the report with the baseline by seed and list task pass, GUI-only, all eight A22 criteria, `driver_isolation` and full passes. State the thinking difference from the baseline. To isolate the driver's contribution, add a thinking `low` run or an ablation without runner guidance.
5. Separately run human concurrent-use trials and release archive checks from [the validation guide](VALIDATION.md). Offscreen, desktop and human trials cover different behavior.
