# Cua Driver Bench v2 with Pi

[中文版本](zh-CN/BENCH_V2.md)

`npm run bench:v2` integrates the ten macOS tasks from Cua Driver Bench v2 at commit `22a67eacd15dc71811e330ed88951dd615bb395d`. The runner fetches the pinned subtree into `.research/` and verifies the source files against Git blob IDs. It uses upstream task prompts, seeds, fixtures, evaluators and A22 scoring. The local arm runs our MCP with Pi and `openai-codex/gpt-6.1-terra` at low reasoning effort. [Pinned upstream benchmark](https://github.com/trycua/cua/tree/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench)

```sh
npm ci --ignore-scripts
npm run build
npm run bench:v2 -- --doctor
npm run bench:v2 -- --prepare
npm run bench:v2 -- --run --tasks benchlab
```

Use an unlocked Apple silicon Mac on macOS 26 or later, with Python 3.10+, Node 22+, Xcode Command Line Tools and Pi with built-in direct MCP support. Grant the existing helper Accessibility and Screen Recording in macOS Settings. The runner calls `pi auth check` for the exact provider and model. Pi uses its existing login through a temporary link. The runner never reads or exports its credentials and leaves the regular Pi settings and MCP configuration in place. Set `PI_COMMAND`, `PI_CODING_AGENT_DIR` or `CU_BENCH_PYTHON` if your installation uses nondefault locations.

`--run` starts the owned BenchLab and BenchSentinel windows. The sentinel takes focus by design and simulates user typing in its own window. Reserve the desktop for the run. Each trial waits for hardware idle, and a hardware-idle reset or a `STOP` file in the result directory stops the current model run. Ctrl+C also stops the runner. It releases only its own process groups and the shared fixture lease.

## Select tasks and conditions

The default `benchlab` selection runs MB-09–11 and IR-01–04. Use `--tasks IR-02,MB-09` for a small run. Without `--run`, the command prints the plan. `--condition` accepts `background` (default), `foreground` or `both`. In the foreground condition the upstream witness replaces the typing window, and explicit `app.hover` can focus an owned window and move the real pointer. Other trial input uses the background path. `--runs 1` through `--runs 5` controls repetitions and `--seed` controls task ordering. Each trial has at most 360 seconds and 45 turns.

Use `--run-index 0` through `--run-index 4` instead of `--runs` to reproduce one upstream replicate. The printed plan includes the actual task seed. To continue a new run after an interruption, use `npm run bench:v2 -- --run --resume artifacts/bench-v2-pi-…/summary.json`. The runner recovers each completed row from its trial directory, skips all scored results, and keeps infrastructure retries in separate attempt directories. It checks the source and executable hashes, fixture binaries, provider/model, task plan and environment before continuing. Older summaries can be used to look up a replicate index for a new comparison. A `STOP` file must be removed before resuming.

`--tasks v2` includes CDB-G02, G03 and G04. Those workflows require LibreOffice, GnuCash, Chrome and the taskpack's locked Electron apps. Install each Electron project's dependencies with `npm ci` in its pinned `taskpack/tasks/shared/cdb-s0{2,3,4}/apps/` project directory, then run `--doctor --tasks v2` to check the exact prerequisites. Use a dedicated desktop and pass `--allow-multi-app` for the live run. The runner refuses concurrent benchmark apps and stock apps that require an exclusive launch. Chrome can coexist with an already-running instance when the pinned command declares a fresh trial-local `--user-data-dir`. MCP access is limited to PIDs from the process groups the runner starts. The temporary LibreOffice profile disables welcome and tip dialogs before launch. Missing prerequisites stop the suite before any trials run.

The runner passes `--disable-backgrounding-occluded-windows` to the Electron fixtures it launches so fully covered renderers can respond to accessibility actions. The pinned task source, GUI-only rules, checkers and A22 criteria remain in effect.

For trials with multiple owned target processes, the runner's system instructions ask Pi to track pending work across windows and verify saves by reopening the edited item if the UI provides no confirmation.

When a trial includes LibreOffice Calc, the runner also describes the verified GUI path through cell selection, the Formula editor, Accept and the toolbar Save control. Use a fresh AX observation between those steps and read the actual cell after committing.

On a reserved desktop, repeat `--appkit-key-bundle BUNDLE_ID` to allow explicit `pressKey` calls with `strategy:'appkit'` for selected apps in a background trial. Use `--appkit-click-bundle BUNDLE_ID` to separately allow plain left coordinate clicks with that strategy. Both options enable experimental app-local focus preparation for the selected calls. The runner records the two bundle lists in the journal and restores them on resume. A22 and GUI-only scoring apply to the trial.

The isolated Chrome process keeps the login session's `HOME` for macOS loopback navigation. It uses the fresh trial profile and disables its updater scheduler for that launch. Pi and the other fixtures retain their isolated homes. [Chromium process switches](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h)

```sh
npm run bench:v2 -- --tasks v2 --condition both --runs 5
npm run bench:v2 -- --doctor --tasks v2
npm run bench:v2 -- --run --tasks v2 --condition both --runs 5 --allow-multi-app
```

## Read results

The baseline and targeted repair results are tracked separately. [Bench v2 failure reproduction](BENCH_V2_REMEDIATION.md)

`artifacts/bench-v2-pi-*/summary.json` contains the plan, observed provider and model, token usage, real turn counts, wall times, checker results and A22 criteria. Each trial also retains Pi's JSONL, native fixture state/events, the sentinel log and checker output. An infrastructure error stops the schedule and stays out of the scored denominator. A checker failure or a recorded interference can be a valid benchmark result. Exit zero means all planned trials were scored. Use the recorded task and background completion counts to assess performance.

Pi gets only the two MCP tools. A benchmark JS gate blocks OS, file and network operations, and native requests are scoped by bundle, owned PID and observed snapshot. Capture is limited to the owned windows. Real pointer hover is not part of the current MCP, and `app.move` moves the visual overlay only. MB-10 and MB-11 can expose this gap. The harness preserves such failures and measures all eight A22 criteria through the upstream sentinel.

During a trial the idle guard checks HID event counters separately from IOKit idle time. A counter change or unexplained idle reset interrupts the run. It can continue after a fresh WindowServer tickle only when the executable, MCP scope and Pi ancestry identify the trial's own helper and the HID counters stayed unchanged. This affects runner interruption handling only. The upstream sentinel and A22 retain their original measurements and scoring.

This is a local Pi arm using the pinned task set. Report the display, selected tasks, repetitions and backend policy alongside results. The upstream comparison uses different agents, desktop setup and trial schedules. [Upstream method](https://github.com/trycua/cua/blob/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench/METHOD.md)

On 2026-11-08 the isolated Pi connection returned the requested provider and model and completed one empty-window MCP call. The desktop attempt timed out waiting for idle before any trial opened. There are no scored trials for this integration yet. The three multi-app workflows also require dependencies absent from this Mac.
