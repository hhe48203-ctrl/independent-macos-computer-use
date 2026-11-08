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

The default `benchlab` selection runs MB-09–11 and IR-01–04. Use `--tasks IR-02,MB-09` for a small run. Without `--run`, the command prints the plan. `--condition` accepts `background` (default), `foreground` or `both`. In the foreground condition the upstream witness replaces the typing window. This arm still uses the independent backend's background input path. `--runs 1` through `--runs 5` controls repetitions and `--seed` controls task ordering. Each trial has at most 360 seconds and 45 turns.

`--tasks v2` includes CDB-G02, G03 and G04. Those workflows require LibreOffice, GnuCash, Chrome and the taskpack's locked Electron apps. Install each Electron project's dependencies with `npm ci` in its pinned `taskpack/tasks/shared/cdb-s0{2,3,4}/apps/` project directory, then run `--doctor --tasks v2` to check the exact prerequisites. Use a dedicated desktop with the stock apps closed and pass `--allow-multi-app` for the live run. The runner uses per-trial workspaces and profiles and admits only windows from process groups it started. It refuses to start a suite with missing prerequisites rather than quietly dropping tasks.

```sh
npm run bench:v2 -- --tasks v2 --condition both --runs 5
npm run bench:v2 -- --doctor --tasks v2
npm run bench:v2 -- --run --tasks v2 --condition both --runs 5 --allow-multi-app
```

## Read results

`artifacts/bench-v2-pi-*/summary.json` contains the plan, observed provider and model, token usage, real turn counts, wall times, checker results and A22 criteria. Each trial also retains Pi's JSONL, native fixture state/events, the sentinel log and checker output. An infrastructure error stops the schedule and stays out of the scored denominator. A checker failure or a recorded interference can be a valid benchmark result. Exit zero means all planned trials were scored. Use the recorded task and background completion counts to assess performance.

Pi gets only the two MCP tools. A benchmark JS gate blocks OS, file and network operations, and native requests are scoped by bundle, owned PID and observed snapshot. Capture is limited to the owned windows. Real pointer hover is not part of the current MCP, and `app.move` moves the visual overlay only. MB-10 and MB-11 can expose this gap. The harness preserves such failures and measures all eight A22 criteria through the upstream sentinel.

This is a local Pi arm using the pinned task set. Report the display, selected tasks, repetitions and backend policy alongside results. The upstream comparison uses different agents, desktop setup and trial schedules. [Upstream method](https://github.com/trycua/cua/blob/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench/METHOD.md)

On 2026-11-08 the isolated Pi connection returned the requested provider and model and completed one empty-window MCP call. The desktop attempt timed out waiting for idle before any trial opened. There are no scored trials for this integration yet. The three multi-app workflows also require dependencies absent from this Mac.
