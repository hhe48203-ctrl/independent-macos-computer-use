#!/usr/bin/env python3
"""Pinned Cua Driver Bench v2 with a local Pi / independent MCP arm."""

import argparse
from contextlib import ExitStack
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import signal
import socket
import subprocess as sp
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
UPSTREAM = "https://github.com/trycua/cua.git"
REVISION = "22a67eacd15dc71811e330ed88951dd615bb395d"
SUBTREE = "libs/cua-driver-bench"
RESEARCH = ROOT / ".research"
SOURCE = RESEARCH / f"cdb-pinned-{REVISION}"
BUILD = ROOT / ".build" / f"cdb-v2-{REVISION[:12]}"
APPS = BUILD / "apps"
NODE = os.environ["CU_BENCH_NODE"]
PROVIDER = "openai-codex"
MODEL = "gpt-6.1-terra"
ARM = "pi-terra-independent-macos"
TOOLS = ("mcp__cua__js", "mcp__cua__js_reset")
BASE_ENV = {"PATH": os.environ["PATH"], "LANG": "en_US.UTF-8"}


def capture(*command, timeout=20, env=None):
    return sp.check_output(command, text=True, timeout=timeout, env=env).strip()


def write_json(path, data):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", "utf-8")
    temp.replace(path)


def git_cache():
    # Reuse the original investigation's Git objects, never its working files.
    existing = RESEARCH / "cdb-upstream"
    if existing.is_dir() and sp.run(
        ["git", "-C", str(existing), "cat-file", "-e", f"{REVISION}^{{commit}}"],
        capture_output=True,
    ).returncode == 0:
        return existing
    cache = RESEARCH / "cdb-bench.git"
    RESEARCH.mkdir(parents=True, exist_ok=True)
    if not cache.is_dir():
        sp.run(["git", "init", "--bare", str(cache)], check=True)
        sp.run(["git", "-C", str(cache), "remote", "add", "origin", UPSTREAM], check=True)
        sp.run(["git", "-C", str(cache), "config", "remote.origin.promisor", "true"], check=True)
        sp.run(["git", "-C", str(cache), "config", "remote.origin.partialclonefilter", "blob:none"], check=True)
    if sp.run(["git", "-C", str(cache), "cat-file", "-e", f"{REVISION}^{{commit}}"], capture_output=True).returncode:
        sp.run(["git", "-C", str(cache), "fetch", "--depth=1", "--filter=blob:none", UPSTREAM, REVISION], check=True, timeout=180)
    return cache


def pinned_source():
    cache = git_cache()
    ref = f"{REVISION}:{SUBTREE}"
    tree = capture("git", "-C", str(cache), "rev-parse", ref)
    if not SOURCE.exists():
        RESEARCH.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="cdb-source-", dir=RESEARCH) as tmp:
            with sp.Popen(["git", "-C", str(cache), "archive", ref], stdout=sp.PIPE) as archive:
                sp.run(["/usr/bin/tar", "-xf", "-", "-C", tmp], stdin=archive.stdout, check=True, timeout=120)
                if archive.wait(timeout=20):
                    raise RuntimeError("Could not archive the pinned benchmark subtree")
            Path(tmp).rename(SOURCE)
    entries = capture("git", "-C", str(cache), "ls-tree", "-rz", ref).split("\0")
    for entry in filter(None, entries):
        metadata, relative = entry.split("\t", 1)
        mode, kind, expected = metadata.split()
        target = SOURCE / relative
        if kind != "blob" or target.is_symlink() != (mode == "120000"):
            raise RuntimeError(f"Pinned source path changed: {relative}")
        data = os.readlink(target).encode() if mode == "120000" else target.read_bytes()
        actual = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Pinned source differs from {REVISION}: {relative}")
    return SOURCE / "automated-eval" / "macos_bench", tree


def bundle_info(app):
    return plistlib.loads((app / "Contents/Info.plist").read_bytes())


def build_fixtures(bench):
    if APPS.is_dir():
        for name in ("BenchLab", "BenchSentinel"):
            sp.run(["/usr/bin/codesign", "--verify", "--strict", str(APPS / f"{name}.app")], check=True, timeout=15)
        return
    BUILD.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="fixture-build-", dir=BUILD) as tmp:
        sp.run(["/bin/bash", str(bench / "swift/build.sh"), tmp], check=True, timeout=180)
        Path(tmp).rename(APPS)


def inspect_bridge(bundle_ids):
    env = dict(BASE_ENV, CU_ALLOWED_BUNDLE_IDS=",".join(sorted(bundle_ids)))
    return json.loads(capture(NODE, str(HERE / "mcp.mjs"), "--check", env=env))


def groups():
    return {int(pid): int(group) for pid, group in (line.split() for line in capture(
        "/bin/ps", "-axo", "pid=,pgid=").splitlines())}


def wait_targets(pids, bundle_ids):
    """Resolve only windows of subprocess groups that this trial started."""
    until = time.monotonic() + 20
    while time.monotonic() < until:
        owners = groups()
        windows = inspect_bridge(bundle_ids)["windows"]
        found = {w["pid"]: w["bundleId"] for w in windows
                 if w["onScreen"] and owners.get(w["pid"]) in pids}
        if set(owners[pid] for pid in found) >= set(pids):
            return [{"pid": pid, "bundleId": bundle} for pid, bundle in sorted(found.items())]
        time.sleep(0.3)
    raise RuntimeError("The owned GUI processes did not register all benchmark windows")


def pack_requirements(cdb, spec):
    descriptor = cdb._descriptor(spec)
    bundles, missing = set(), []
    for app in descriptor["apps"]:
        if app["kind"] == "electron":
            bundle = cdb.pack_tasks_root() / spec["pack_task"]
            cwd = Path(app["cwd"].replace("${bundle}", str(bundle)))
            if not (cwd / "node_modules/electron/dist/Electron.app").is_dir():
                missing.append(f"locked Electron installation in {cwd}")
            bundles.add(cdb.electron_bundle_id(cdb.app_display_name(app)))
        for command in app["command"]:
            if command.startswith("/Applications/") and ".app/" in command:
                if not Path(command).is_file():
                    missing.append(command)
                else:
                    bundles.add(bundle_info(Path(command.split(".app/")[0] + ".app"))["CFBundleIdentifier"])
    return bundles, missing


def pi_auth():
    pi = shutil.which(os.environ.get("PI_COMMAND") or "pi")
    if not pi:
        raise RuntimeError("Install Pi and sign in with its OpenAI Codex provider")
    location = Path(os.environ.get("PI_CODING_AGENT_DIR") or Path.home() / ".pi/agent")
    auth = (location / "auth.json").resolve(strict=True)
    # Pi checks its own login. Neither the runner nor the MCP reads this file.
    sp.run([pi, "auth", "check", "--provider", PROVIDER, "--model", MODEL, "--no-refresh"],
           stdout=sp.DEVNULL, stderr=sp.DEVNULL, timeout=30, check=True)
    return pi, auth, location


def json_lines(path):
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text("utf-8", errors="replace").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def owned_stop(desktop, proc):
    desktop.stop_group(proc.pid)
    proc.wait(timeout=5)


def run_agent(pi, auth, catalog, targets, prompt, artifacts, turns, seconds, desktop, idle_seconds, stop_file):
    with tempfile.TemporaryDirectory(prefix="cdb-pi-") as temp:
        sandbox = Path(temp)
        agent = sandbox / "agent"
        home = sandbox / "home"
        agent.mkdir()
        home.mkdir()
        (agent / "auth.json").symlink_to(auth)
        model_catalog = catalog / "models-store.json"
        if model_catalog.is_file():
            (agent / model_catalog.name).symlink_to(model_catalog.resolve())
        scope = artifacts / "scope.json"
        write_json(scope, {"targets": targets, "audit": str(artifacts / "gui-guard.jsonl")})
        bundles = ",".join(sorted({t["bundleId"] for t in targets}))
        mcp = {"autoEnableCodemode": False, "mcpServers": {"cua": {
            "command": "/usr/bin/env", "exposure": "direct", "args": [
                "-i", f"HOME={home}", f"PATH={BASE_ENV['PATH']}", f"TMPDIR={temp}",
                f"CU_ALLOWED_BUNDLE_IDS={bundles}", "CU_ENABLE_FOREGROUND=0",
                "CU_ENABLE_CLIPBOARD=0", "CU_EXPERIMENTAL_APPKIT_FOCUS=0", "CU_AGENT_CURSOR_VISIBILITY=target",
                NODE, str(HERE / "mcp.mjs"), "--serve", str(scope)
            ]
        }}}
        write_json(agent / "mcp.json", mcp)
        write_json(artifacts / "mcp-config.json", mcp)
        env = dict(BASE_ENV, HOME=str(home), TMPDIR=temp, PI_CODING_AGENT_DIR=str(agent),
                   PI_OFFLINE="1", PI_SKIP_VERSION_CHECK="1", PI_TELEMETRY="0", CU_BENCH_TURNS=str(turns))
        instructions = (
            "You are taking a GUI-only desktop benchmark. Use mcp__cua__js and its preinitialized cua/app APIs. "
            "Start with await cua.listWindows(), then bind a listed window by PID and windowId. "
            "Use only these benchmark windows. Use direct documented GUI calls, simple named variables and "
            "array/string methods. Read current AX indices before using them. Window screenshots are available. "
            "No shell, files, imports, network or clipboard access. The move method only moves a visual overlay. "
            "Await actions, observe their effects, and report what you achieved."
        )
        command = [pi, "--print", "--mode", "json", "--no-session", "--provider", PROVIDER, "--model", MODEL,
                   "--thinking", "low", "--approve", "--no-extensions", "-e", "builtin:mcp", "-e",
                   str(HERE / "pi-gate.mjs"), "--no-skills", "--no-context-files", "--no-prompt-templates",
                   "--no-themes", "--no-builtin-tools", "--tools", ",".join(TOOLS),
                   "--system-prompt", instructions, "--", prompt]
        started = time.monotonic()
        timed_out = False
        interrupted = None
        previous_idle = idle_seconds()
        with (artifacts / "pi.jsonl").open("wb") as log, (artifacts / "pi.stderr").open("wb") as stderr:
            proc = sp.Popen(command, cwd=temp, env=env, stdout=log, stderr=stderr,
                            stdin=sp.DEVNULL, start_new_session=True)
            try:
                while proc.poll() is None:
                    remaining = seconds - (time.monotonic() - started)
                    if remaining <= 0:
                        timed_out = True
                        break
                    try:
                        proc.wait(timeout=min(1, remaining))
                    except sp.TimeoutExpired:
                        now_idle = idle_seconds()
                        if stop_file.exists() or now_idle + 0.75 < previous_idle:
                            interrupted = "STOP file or hardware activity interrupted the trial"
                            break
                        previous_idle = now_idle
            finally:
                owned_stop(desktop, proc)
        return {"exit_code": proc.returncode, "seconds": round(time.monotonic() - started, 2),
                "timed_out": timed_out, "interrupted": interrupted}


def agent_facts(events, guard, v2):
    assistant = [e["message"] for e in events if e.get("type") == "message_end"
                 and e.get("message", {}).get("role") == "assistant"]
    identities = sorted({(msg.get("provider", ""), msg.get("model", "")) for msg in assistant if msg.get("model")})
    starts = [e for e in events if e.get("type") == "tool_execution_start"]
    violations = {g["message"] for g in guard if g.get("code") == "BENCH_GUI_ONLY"}
    for message in assistant:
        for item in message.get("content", []):
            if item.get("type") != "toolCall":
                continue
            name = item.get("name", "")
            if name not in TOOLS:
                violations.add(f"Unexpected tool: {name}")
            violations.update(v2.scan_tool_use(name, item.get("arguments", {}))[0])
    usage = {key: sum(msg.get("usage", {}).get(key, 0) for msg in assistant)
             for key in ("input", "output", "cacheRead", "cacheWrite")}
    return {"model_verified": identities == [(PROVIDER, MODEL)], "observed_models": identities,
            "turns": sum(e.get("type") == "turn_start" for e in events), "tool_calls": len(starts),
            "tool_errors": sum(e.get("type") == "tool_execution_end" and bool(e.get("isError")) for e in events),
            "gui_only_violations": sorted(violations), "gui_only": not violations and all(e.get("toolName") in TOOLS for e in starts),
            "provider_error": any(msg.get("stopReason") == "error" for msg in assistant), "usage": usage}


def run_trial(entry, condition, out, task, spec, bundle_ids, login, modules):
    pilot, v2, runner, desktop, cdb = modules
    seed = pilot.probe_seed(task.id, entry["run_index"])
    trial = out / f"{entry['order_index']:03d}-{task.id}-{condition}"
    artifacts = trial / "artifacts"
    artifacts.mkdir(parents=True)
    row = dict(entry, id=task.id, seed=seed, condition=condition, status="infrastructure_error")
    sentinel = pilot.Sentinel(APPS / "BenchSentinel.app", artifacts / "sentinel.jsonl",
                              v2.sentinel_args(condition) + ["--no-activate"])
    lab = pack = None
    armed = False
    print(f"START {task.id} {condition} seed={seed}", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="cdb-fixtures-") as temp:
            old_home = os.environ["HOME"]
            os.environ["HOME"] = temp
            try:
                if spec.get("kind") == "cdb":
                    pack = cdb.CdbTask(spec, artifacts, seed)
                    pack.workspace = Path(temp) / "workspace"
                    # Run only the pack's exact setup and verification commands.
                    # CdbTask.reset/stop_apps also sweep unrelated processes.
                    for step in ("setup", "verify"):
                        result = pack._run(pack.descriptor["semantics"]["reset"][step])
                        (artifacts / f"reset-{step}.log").write_text(result.stdout + result.stderr, "utf-8")
                        result.check_returncode()
                    brief = pack.brief()
                    pack.start_apps(force_accessibility=True)
                    pids = [proc.pid for app, proc in zip(pack.apps(), pack.procs) if app["kind"] != "service"]
                else:
                    brief, paths = pilot.prepare_probe(task, seed, trial, APPS / "BenchLab.app")
                    lab = pilot.launch_lab(task, seed, paths, APPS / "BenchLab.app", {"HOME": temp})
                    pids = [lab.pid]
                targets = wait_targets(pids, bundle_ids)
                sentinel.start()
                sentinel.activate()
                sentinel.toggle_armed()
                armed = True
                if not any(s.get("ev") == "armed" and s.get("key") and s.get("active")
                           for s in json_lines(sentinel.log)):
                    raise RuntimeError("The owned BenchSentinel was not active and key at trial start")
                prompt = v2.brief_for(brief, condition)
                (artifacts / "prompt.txt").write_text(prompt, "utf-8")
                max_turns = min(45, int(spec.get("max_turns", 45)))
                row.update(run_agent(*login, targets, prompt, artifacts, max_turns, min(360, task.timeout_s),
                                     desktop, pilot.hid_idle_seconds, out / "STOP"))
                sentinel.toggle_armed()
                armed = False
                row["disturbance"] = sentinel.summary()
                row["agent"] = agent_facts(json_lines(artifacts / "pi.jsonl"), json_lines(artifacts / "gui-guard.jsonl"), v2)
                row["evaluation"] = pack.evaluate(row["exit_code"]) if pack else runner.evaluate_probe(
                    task, seed, paths, artifacts, sentinel.log)
                if row["interrupted"]:
                    raise RuntimeError(row["interrupted"])
                if not row["agent"]["model_verified"] or row["agent"]["provider_error"]:
                    raise RuntimeError("Pi did not confirm a successful response from the required provider/model")
                if not row["disturbance"].get("available") or "error" in row["evaluation"]:
                    raise RuntimeError("Sentinel or evaluator did not produce usable measurements")
                row["passed"] = bool(row["evaluation"]["passed"] and row["agent"]["gui_only"] and
                                     not row["timed_out"] and row["agent"]["turns"] <= max_turns and row["exit_code"] == 0)
                row["background"] = v2.background_score(row["disturbance"], True)
                row["multiplayer"] = v2.multiplayer_score(row["disturbance"], row["background"]["measured"], row["passed"], condition)
                row["interruption"] = v2.interruption_of(row["evaluation"])
                row["status"] = "scored"
            finally:
                os.environ["HOME"] = old_home
                with ExitStack() as cleanup:
                    for proc in pack.procs if pack else [lab] if lab else []:
                        cleanup.callback(owned_stop, desktop, proc)
                    cleanup.callback(sentinel.stop)
                    if armed:
                        cleanup.callback(sentinel.toggle_armed)
    except (RuntimeError, OSError, sp.SubprocessError, ValueError) as error:
        row["error"] = f"{type(error).__name__}: {error}"
    finally:
        write_json(trial / "trial.json", row)
    print(f"RESULT {task.id} {row['status']} passed={row.get('passed')} A22={row.get('multiplayer', {}).get('background_completion')}", flush=True)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    command = parser.add_mutually_exclusive_group()
    command.add_argument("--run", action="store_true", help="Run on a dedicated, unlocked desktop; the owned witness takes focus")
    command.add_argument("--prepare", action="store_true", help="Fetch and verify the pinned source, then build the owned fixtures")
    command.add_argument("--doctor", action="store_true", help="Check local prerequisites without starting a trial")
    parser.add_argument("--tasks", default="benchlab", help="benchlab (seven native probes), v2 (all ten), or comma-separated IDs")
    parser.add_argument("--condition", choices=["background", "foreground", "both"], default="background")
    parser.add_argument("--runs", type=int, default=1, help="Replications per task and condition")
    parser.add_argument("--seed", type=int, default=2026, help="Blocked task-order seed")
    parser.add_argument("--idle-seconds", type=float, default=10, help="Require this much hardware idle time before each trial")
    parser.add_argument("--allow-multi-app", action="store_true", help="Allow stock-app launches on a dedicated benchmark desktop")
    args = parser.parse_args()
    if not 1 <= args.runs <= 5 or not 0 <= args.idle_seconds <= 60:
        parser.error("Use 1–5 runs and 0–60 idle seconds")
    if platform.system() != "Darwin" or platform.machine() != "arm64" or int(platform.mac_ver()[0].split('.')[0]) < 26:
        parser.error("The pinned macOS v2 fixtures require Apple silicon and macOS 26 or later")

    bench, tree = pinned_source()
    os.environ["CDB_BENCH_WORK"] = str(BUILD)
    sys.path.insert(0, str(bench))
    import run_pilot as pilot
    import bench_v2 as v2
    import run_bench as runner
    import desktop_runtime as desktop
    import cdb_adapter as cdb

    tasks = runner.load_tasks(bench / "probes")
    ids = list(v2.V2_TASKS) if args.tasks == "v2" else [tid for tid in v2.V2_TASKS if not tid.startswith("CDB-")] \
        if args.tasks == "benchlab" else args.tasks.split(",")
    if len(ids) != len(set(ids)) or any(tid not in v2.V2_TASKS for tid in ids):
        parser.error(f"Select distinct v2 tasks: {', '.join(v2.V2_TASKS)}")
    specs = {tid: json.loads((tasks[tid].probe_dir / "task.json").read_text("utf-8")) for tid in ids}
    problems = v2.validate_tasks(specs, ids)
    if problems:
        parser.error("; ".join(problems))
    schedule = pilot.build_schedule(ids, [ARM], args.runs, args.seed)
    conditions = list(v2.CONDITIONS) if args.condition == "both" else [args.condition]
    plan = [dict(row, condition=condition) for row in schedule for condition in conditions]
    for index, entry in enumerate(plan):
        entry["order_index"] = index
    report = {"benchmark_version": 2, "upstream_commit": REVISION, "upstream_tree": tree, "arm": ARM,
              "provider": PROVIDER, "model": MODEL, "thinking": "low", "schedule_seed": args.seed, "plan": plan}
    if args.prepare:
        build_fixtures(bench)
        print(APPS)
        return 0
    if not (args.run or args.doctor):
        print(json.dumps(report, indent=2))
        return 0
    bundles, missing = {}, []
    for tid, spec in specs.items():
        if spec.get("kind") == "cdb":
            bundles[tid], deps = pack_requirements(cdb, spec)
            missing.extend(deps)
        else:
            bundles[tid] = {"ai.cua.benchlab"}
    if missing:
        raise RuntimeError("Missing benchmark prerequisites:\n  " + "\n  ".join(sorted(set(missing))))
    login = pi_auth()
    status = inspect_bridge(set())
    if not all(status["permissions"].get(p) for p in ("accessibility", "screenRecording")):
        raise RuntimeError("Grant the existing native helper Accessibility and Screen Recording through macOS Settings")
    if args.doctor:
        print(json.dumps(dict(report, prerequisites="ready", pi_version=capture(login[0], "--version"), displays=status["displays"]), indent=2))
        return 0
    running_apps = inspect_bridge({"ai.cua.benchlab", "ai.cua.benchsentinel"} | set().union(*bundles.values()))["apps"]
    if running_apps:
        raise RuntimeError("A benchmark or selected stock app is already running. Use a dedicated desktop with those apps closed.")
    if any(spec.get("kind") == "cdb" for spec in specs.values()):
        if not args.allow_multi_app:
            parser.error("Use --allow-multi-app on a dedicated desktop for the stock-app workloads")
        if "CDB-G04" in ids:
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 4184))
    build_fixtures(bench)
    out = ROOT / "artifacts" / ("bench-v2-pi-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    out.mkdir(parents=True, mode=0o700)
    report.update(project_commit=capture("git", "rev-parse", "HEAD") if (ROOT / ".git").exists() else None,
                  pi_version=capture(login[0], "--version"), macos=platform.mac_ver()[0], displays=status["displays"],
                  scope="Local Pi arm, pinned task fixtures/checkers and A22 metrics. No official cross-arm run.", trials=[])
    print(f"REPORT {out / 'summary.json'}", flush=True)
    write_json(out / "summary.json", report)
    try:
        for entry in plan:
            if pilot.wait_for_idle(args.idle_seconds, 60, out / "STOP") is None:
                report["stop_reason"] = "Desktop was not idle or STOP file was created"
                break
            row = run_trial(entry, entry["condition"], out, tasks[entry["task"]],
                            specs[entry["task"]], bundles[entry["task"]], login, (pilot, v2, runner, desktop, cdb))
            report["trials"].append(row)
            write_json(out / "summary.json", report)
            if row["status"] == "infrastructure_error":
                report["stop_reason"] = row.get("error", "Infrastructure error")
                break
    finally:
        rows = [r for r in report["trials"] if r["status"] == "scored"]
        background = [r for r in rows if r["condition"] == "background"]
        report["totals"] = {"planned": len(plan), "scored": len(rows), "passed": sum(r["passed"] for r in rows),
                            "background_scored": len(background), "background_completion": sum(r["multiplayer"]["background_completion"] for r in background)}
        write_json(out / "summary.json", report)
        print("TOTAL", json.dumps(report["totals"]), flush=True)
    return 0 if len(rows) == len(plan) else 1


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(130))
    try:
        sys.exit(main())
    except (RuntimeError, OSError, sp.SubprocessError, ValueError) as error:
        print(f"bench:v2: {error}", file=sys.stderr)
        sys.exit(1)
