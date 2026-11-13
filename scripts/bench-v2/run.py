#!/usr/bin/env python3
"""Pinned Cua Driver Bench v2 with a local Pi / independent MCP arm."""

import argparse
from contextlib import ExitStack
import datetime as dt
from functools import partial
import hashlib
import http.client
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
from urllib.parse import urlsplit

import activity
import journal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
UPSTREAM = "https://github.com/trycua/cua.git"
REVISION = "22a67eacd15dc71811e330ed88951dd615bb395d"
SUBTREE = "libs/cua-driver-bench"
RESEARCH = ROOT / ".research"
SOURCE = RESEARCH / f"cdb-pinned-{REVISION}"
BUILD = ROOT / ".build" / f"cdb-v2-{REVISION[:12]}"
APPS = BUILD / "apps"
NATIVE = ROOT / ".build/Local Computer Use.app/Contents/MacOS/computer-use-bridge"
NODE = os.environ["CU_BENCH_NODE"]
PROVIDER = "openai-codex"
MODEL = "gpt-6.1-terra"
THINKING = "high"
ARM = "pi-terra-independent-macos"
TOOLS = ("mcp__cua__js", "mcp__cua__js_reset")
BASE_ENV = {"PATH": os.environ["PATH"], "LANG": "en_US.UTF-8"}
ARTIFACTS = ROOT / "artifacts"


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


def code_identity():
    digest = hashlib.sha256()
    files = [ROOT / p for p in ("package.json", "package-lock.json", "scripts/bench-v2.mjs", "scripts/fixture-lease.mjs")]
    for directory, patterns in ((ROOT / "src", ("*.mjs",)), (ROOT / "native", ("*.swift",)), (HERE, ("*.py", "*.mjs"))):
        for pattern in patterns:
            files.extend(directory.glob(pattern))
    for path in sorted(files):
        digest.update(str(path.relative_to(ROOT)).encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


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


def workspace_profile(app, option, workspace_variable):
    """Return a profile path only for a single explicit workspace-local option."""
    flags = [arg for arg in app["command"] if arg == option or arg.startswith(option + "=")]
    prefix = f"{option}=${{{workspace_variable}}}/"
    if len(flags) != 1 or not flags[0].startswith(prefix):
        return None
    suffix = flags[0][len(prefix):]
    relative = Path(suffix)
    if (not relative.is_absolute() and len(relative.parts) >= 2 and relative.parts[0] == ".runtime" and
            ".." not in relative.parts and "$" not in suffix and "%" not in suffix):
        return relative
    return None


def prepare_app_profile(pack, app, option, workspace_variable):
    relative = workspace_profile(app, option, workspace_variable)
    if relative is None:
        raise RuntimeError(f"{app['id']} requires an explicit trial-local profile")
    profile = pack.workspace / relative
    if (profile.resolve() != pack.workspace.resolve() / relative or
            (profile.exists() and (not profile.is_dir() or any(profile.iterdir())))):
        raise RuntimeError(f"{app['id']} profile is not a fresh trial-local path")
    return profile


def prepare_pack_apps(pack, login_home):
    for app in pack.apps():
        if app["kind"] == "electron":
            # Keep fully covered benchmark renderers responsive to AX actions.
            flag = "--disable-backgrounding-occluded-windows"
            if flag not in app["command"]:
                app["command"].append(flag)
        elif app["kind"] == "spreadsheet" and Path(app["command"][0]).name == "soffice":
            # The throwaway profile otherwise opens a first-use modal over the workbook.
            profile = prepare_app_profile(pack, app, "-env:UserInstallation", "workspace_uri")
            config = profile / "user" / "registrymodifications.xcu"
            config.parent.mkdir(parents=True)
            config.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<oor:items xmlns:oor="http://openoffice.org/2001/registry">\n'
                '<item oor:path="/org.openoffice.Office.Common/Misc">'
                '<prop oor:name="ShowTipOfTheDay" oor:op="fuse"><value>false</value></prop></item>\n'
                '<item oor:path="/org.openoffice.Setup/Product">'
                '<prop oor:name="WhatsNew" oor:op="fuse"><value>false</value></prop>'
                '</item>\n</oor:items>\n', "utf-8")
        elif app["kind"] == "browser" and workspace_profile(app, "--user-data-dir", "workspace"):
            prepare_app_profile(pack, app, "--user-data-dir", "workspace")
            if Path(app["command"][0]).name == "Google Chrome":
                # A synthetic HOME prevented loopback pages from loading on macOS.
                # Chrome's profile remains the fresh --user-data-dir verified above.
                app["env"] = dict(app.get("env") or {}, HOME=login_home)
                # Keep the temporary instance from starting the machine's updater.
                app["command"][1:1] = ["--disable-updater-scheduler"]
        elif app["kind"] == "service":
            # The pinned adapter waits on `http`, whereas the
            # descriptor can use `url`. Wait before opening GUI apps.
            app["ready"]["http"] = service_endpoint(app["ready"]).geturl()


def pack_requirements(cdb, spec):
    descriptor = cdb._descriptor(spec)
    bundles, exclusive_bundles, missing, services = set(), set(), [], []
    for app in descriptor["apps"]:
        if app["kind"] == "electron":
            bundle = cdb.pack_tasks_root() / spec["pack_task"]
            cwd = Path(app["cwd"].replace("${bundle}", str(bundle)))
            electron = cwd / "node_modules/electron/dist/Electron.app"
            lock = json.loads((cwd / "package-lock.json").read_text("utf-8"))
            expected = lock.get("packages", {}).get("node_modules/electron", {}).get("version")
            if (not expected or not (electron / "Contents/MacOS/Electron").is_file() or
                bundle_info(electron).get("CFBundleShortVersionString") != expected):
                missing.append(f"locked Electron installation in {cwd}")
            bundle_id = cdb.electron_bundle_id(cdb.app_display_name(app))
            bundles.add(bundle_id)
            exclusive_bundles.add(bundle_id)
        for command in app["command"]:
            if command.startswith("/Applications/") and ".app/" in command:
                if not Path(command).is_file() or not os.access(command, os.X_OK):
                    missing.append(command)
                else:
                    bundle_id = bundle_info(Path(command.split(".app/")[0] + ".app"))["CFBundleIdentifier"]
                    bundles.add(bundle_id)
                    isolated_chrome = (app["kind"] == "browser" and bundle_id == "com.google.Chrome" and
                                       workspace_profile(app, "--user-data-dir", "workspace") is not None)
                    if not isolated_chrome:
                        exclusive_bundles.add(bundle_id)
        if app["kind"] == "service":
            endpoint = service_endpoint(app.get("ready") or {})
            if endpoint is None:
                missing.append(f"loopback readiness URL for {app['id']}")
            else:
                services.append(endpoint)
    return bundles, exclusive_bundles, missing, services


def service_endpoint(ready):
    url = ready.get("url") or ready.get("http")
    if not url:
        return None
    endpoint = urlsplit(url)
    if endpoint.scheme != "http" or endpoint.hostname != "127.0.0.1" or not endpoint.port or endpoint.username:
        raise ValueError("Only explicit loopback HTTP readiness URLs are supported")
    return endpoint


def wait_service(app, proc, ready):
    endpoint = service_endpoint(ready)
    if endpoint is None:
        raise RuntimeError(f"Owned service {app} has no readiness endpoint")
    deadline = time.monotonic() + min(60, float(ready.get("timeout_seconds", 15)))
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"Owned service {app} exited ({proc.returncode}) before readiness. See app-{app}.log")
        connection = http.client.HTTPConnection(endpoint.hostname, endpoint.port, timeout=1)
        try:
            path = endpoint.path or "/"
            if endpoint.query:
                path += "?" + endpoint.query
            connection.request("GET", path)
            if connection.getresponse().status == 200 and proc.poll() is None:
                return
        except (OSError, http.client.HTTPException):
            pass
        finally:
            connection.close()
        time.sleep(0.2)
    raise RuntimeError(f"Owned service {app} did not become ready. See app-{app}.log")


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


def run_agent(pi, auth, catalog, targets, prompt, artifacts, turns, seconds, desktop, idle_seconds, stop_file,
              *, allow_foreground_hover=False, appkit_key_bundles=(), appkit_click_bundles=()):
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
        write_json(scope, {"targets": targets, "audit": str(artifacts / "gui-guard.jsonl"),
                           "isolationAudit": str(artifacts / "driver-isolation.jsonl"),
                           "allowForegroundHover": allow_foreground_hover})
        owned_bundles = {t["bundleId"] for t in targets}
        bundles = ",".join(sorted(owned_bundles))
        scoped_key_bundles = owned_bundles.intersection(appkit_key_bundles)
        scoped_click_bundles = owned_bundles.intersection(appkit_click_bundles)
        mcp = {"autoEnableCodemode": False, "mcpServers": {"cua": {
            "command": "/usr/bin/env", "exposure": "direct", "args": [
                "-i", f"HOME={home}", f"PATH={BASE_ENV['PATH']}", f"TMPDIR={temp}",
                f"CU_ALLOWED_BUNDLE_IDS={bundles}", f"CU_ENABLE_FOREGROUND={int(allow_foreground_hover)}",
                "CU_ENABLE_CLIPBOARD=0", "CU_EXPERIMENTAL_APPKIT_FOCUS=0", "CU_AGENT_CURSOR_VISIBILITY=target",
                f"CU_EXPERIMENTAL_APPKIT_KEY_BUNDLE_IDS={','.join(sorted(scoped_key_bundles))}",
                f"CU_EXPERIMENTAL_APPKIT_CLICK_BUNDLE_IDS={','.join(sorted(scoped_click_bundles))}",
                NODE, str(HERE / "mcp.mjs"), "--serve", str(scope)
            ]
        }}}
        write_json(agent / "mcp.json", mcp)
        write_json(artifacts / "mcp-config.json", mcp)
        env = dict(BASE_ENV, HOME=str(home), TMPDIR=temp, PI_CODING_AGENT_DIR=str(agent),
                   PI_OFFLINE="1", PI_SKIP_VERSION_CHECK="1", PI_TELEMETRY="0", CU_BENCH_TURNS=str(turns))
        instructions = (
            "You are taking a GUI-only desktop benchmark. Use mcp__cua__js and its preinitialized cua/app APIs. "
            "Start with await cua.listWindows(), then bind a named, on-screen task window by PID and windowId. "
            "For a task spanning several apps, identify the required sources and destinations in the window list. "
            "Re-list windows after opening a document or making an edit that may show a dialog or banner. "
            "Bind an auxiliary window by its exact PID and windowId. Inspect its AX controls and verify dismissal before returning to the document. "
            "Use only these benchmark windows and direct documented GUI calls. "
            "Read current AX indices before using them. If an AX tree omits a control, inspect the bound window screenshot. "
            "Use only the GUI to open task-specified workspace documents, logs and local URLs. "
            "Direct filesystem and network APIs, shell, imports and clipboard access are prohibited. "
            "The move method only moves a visual overlay. Verify each navigation, edit and save from fresh GUI output. "
            "To replace a browser address, focus the current address field, use setValue(index, address), then press Enter. "
            "The text insertion method may update the displayed address without preparing it for submission. "
            "For a Chromium web select that exposes AXPopUpButton, use performSecondaryAction(index, 'focus'), "
            "verify focused:true, then send a printable key matching the option's unique prefix with pressKey(key, {strategy:'event'}). "
            "Verify the selected value before committing any form. Opening a native dropdown can steal keyboard focus. "
            "For navigation that loads asynchronously, observe the page again in a separate call before deciding whether it succeeded. "
            "If a documented operation fails, report which required app or document you could not use and the observed error."
        )
        if len(targets) > 1:
            instructions += (
                " Bind selected windows with cua.getApp({pid,windowId}, {emit:false}) to suppress automatic AX output. "
                "Inspect (await app.getAXNodes({emit:false})).nodes. Filter by role, title, label or value and print only the relevant fields. "
                "AX descriptions appear as node.label. Filter before projecting compact output fields. "
                "Use node.index for GUI actions. "
                "Use await app.getScreenshot(); undefined; to emit a screenshot without echoing its byte array. "
                "Let tool errors end the call. Use the next call to observe the new state. "
                "Use a single variable in each for-of loop, for example for (const item of items) with item[0] and item[1]. "
                "Collect results with results = [...results, result]. The JS subset rejects .push() and .concat(). "
                "Track the required source reads, updates and save checks across all task windows. "
                "Read any visible rules, vocabulary and evidence columns in a destination before writing it. "
                "Use the exact formats specified by the task or the observed destination, including when a field requires only an identifier. "
                "When the same exception text is required in two destinations, keep one verified string and reuse it. "
                "After each verified update, continue to the next unfinished step while you have a supported GUI route. "
                "Correct a rejected JavaScript expression and retry after observing current state. "
                "If one step is blocked, continue the independent steps that you can verify. "
                "If a save has no visible confirmation, reopen the item and read its saved fields before retrying. "
                "Before ending, check each required destination against the task and identify the observed blocker for any unfinished step."
            )
        if "com.trycua.cdbbench.ledger-lantern-mail" in owned_bundles:
            instructions += (
                " In Ledger Lantern Mail, read the current AXCheckBox message titles and select those needed for the task. "
                "Batch up to three observed message titles per call with an inline for-of loop. For each title, use a fresh AX tree "
                "to find its unique message and click it with {strategy:'ax'}. Re-observe the unique AXButton labeled "
                "Open read-only attachment followed by the attachment name and click it with {strategy:'ax'}. "
                "Re-observe, verify the preview and capture its AXStaticText values, then close it with the observed Close attachment AXButton. "
                "Break if any expected control is missing or ambiguous. Print only the relevant attachment content and keep going with the destination edits."
            )
        if "com.trycua.cdbbench.daymark-calendar" in owned_bundles:
            instructions += (
                " In Daymark Calendar, click the observed event button with {strategy:'ax'} and verify its ID in the editor. "
                "If the editor is offscreen, use performSecondaryAction(index, 'scrollToVisible') on an observed editor control that exposes AXScrollToVisible. "
                "Observe the editor again before using an index. For each visible text field, "
                "click it, observe focused:true, then use typeText(newText,{target:field.index,replaceAll:field.value}). "
                "Verify the new value, click Update event with {strategy:'ax'}, then reopen the event to verify the saved fields. "
                "For any event you cite in another app, use the exact ID from the calendar editor's ID field."
            )
        if "org.libreoffice.script" in owned_bundles:
            calc_commit = (
                "Commit with pressKey('enter', {strategy:'appkit'}) in the observed Calc editor. "
                if "org.libreoffice.script" in scoped_key_bundles else
                "Use performSecondaryAction on the Accept button with action 'press' to commit. "
            )
            instructions += (
                " Bind LibreOffice Calc with {emit:false,autoObserve:false}. Take getAXNodes after every action before using another index. "
                "Use the observed cell index with performSecondaryAction(index, 'focus') "
                "and verify the selected address in the Name Box (AXComboBox with identifier pos_window). The cell's AXValue setter may leave it unchanged. "
                "For toolbar controls and the editor, use (await app.getAXNodes({maxNodes:2000,maxDepth:5,emit:false})).nodes "
                "and print just the relevant controls. Use node.index for GUI actions. "
                "Use performSecondaryAction on the Formula button with action 'press'. "
                "Re-observe the unique focused AXTextArea, then use typeText(text,{target:editor.index,replaceAll:editor.value}) "
                "and verify the editor value. " + calc_commit +
                "Verify the actual cell value. Look for the Save AXMenuButton in a shallow AX tree and use its AX press to save."
            )
            if "org.libreoffice.script" in scoped_key_bundles:
                instructions += (
                    " Use app.pressKey('cmd+pagedown', {strategy:'appkit'}) and "
                    "app.pressKey('cmd+pageup', {strategy:'appkit'}) to switch sheets. Verify the new Sheet title. "
                    "If a Controls sheet is present, read it before editing and return to the observed data sheet. "
                    "Use app.pressKey('forwarddelete', {strategy:'appkit'}) after verifying the selected cell when clearing it. "
                    "Time values can display with seconds and AM/PM. Compare the logical time on readback. "
                    "Use app.pressKey('cmd+s', {strategy:'appkit'}) to save after leaving the editor. "
                    "Batch at most one row of observed addresses and desired values per JS call. Long batches can time out. "
                    "Use an inline for-of loop and find cells with nodes.filter(n=>n.role==='AXTextField'&&n.title===address). "
                    "For each cell, take fresh AX observations, check the intended address in the Name Box, and check for a unique focused editor. "
                    "Pass the full observed editor value as replaceAll and check the returned verified field. "
                    "Check the editor value before committing. Read back the committed cell and stop the loop at the first failed check. "
                    "Print the compact results and save finished groups before moving to another app."
                )
        if "org.gnucash.Gnucash" in scoped_key_bundles:
            instructions += (
                " If GnuCash opens a separate Tip of the Day window, bind its exact PID and window ID. "
                "In getAXNodes, find the single node with n.subrole === 'AXCloseButton', n.enabled and n.actions?.includes('AXPress'). "
                "Use performSecondaryAction(node.index, 'press') and refresh listWindows to confirm the tip closed before binding Accounts. "
                "In GnuCash, a pointer click in the account tree can activate the app. Read the current selection in the screenshot. "
                "With the desired parent row selected, use pressKey('shift+=', {strategy:'appkit'}) to expand it. "
                "Use scoped Down and Enter to select and open the observed child account, verifying the screenshot after each key."
            )
        if "org.gnucash.Gnucash" in scoped_click_bundles and "org.gnucash.Gnucash" in scoped_key_bundles:
            instructions += (
                " For an observed GnuCash register row, scoped Up and Down move the current transaction. "
                "Use a fresh screenshot and app.click([x,y], {strategy:'appkit'}) on the Show Splits toolbar button. "
                "Re-observe, then use another scoped click in the Memo column of the observed split row. "
                "If AX omits the editor, use small batches of pressKey(key,{strategy:'event'}) in the already selected editor. "
                "Use 'space' for a space and Shift chords for capitals. Physical keys follow the current keyboard layout, "
                "so verify punctuation before committing. For a horizontally scrolled memo, check the complete text in "
                "the register status line. Verify that the intended row is still selected, "
                "commit with scoped Enter, save with scoped Command-S and verify from a fresh screenshot. "
                "Reserve time and turns for edits and their save checks in both the ledger and workbook. "
                "The register's R column toggles uncleared and cleared. Reconciled status requires the Reconcile workflow. "
                "If the Reconcile command returns BACKGROUND_WINDOW_REORDERED, observe the new state, leave that "
                "workflow pending and verify any independent workbook and ledger edits."
            )
        if scoped_key_bundles or scoped_click_bundles:
            instructions += " Use the remaining turns to attempt required edits when you have an observed, supported GUI route."
        if allow_foreground_hover:
            instructions += (" This foreground trial permits app.hover([x,y], {durationMs:1500,screenshot:true}) "
                             "when the task needs real mouse hover. It activates the bound window and captures its own transient UI.")
        command = [pi, "--print", "--mode", "json", "--no-session", "--provider", PROVIDER, "--model", MODEL,
                   "--thinking", THINKING, "--approve", "--no-extensions", "-e", "builtin:mcp", "-e",
                   str(HERE / "pi-gate.mjs"), "--no-skills", "--no-context-files", "--no-prompt-templates",
                   "--no-themes", "--no-builtin-tools", "--tools", ",".join(TOOLS),
                   "--system-prompt", instructions, "--", prompt]
        started = time.monotonic()
        timed_out = False
        interrupted = None
        read_counters = activity.hid_counter_reader()
        previous_counters = read_counters()
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
                        now_counters = read_counters()
                        decision, changed, tickle_pid = activity.activity_decision(
                            previous_idle, now_idle, previous_counters, now_counters,
                            lambda max_age: activity.owned_tickle(NATIVE, HERE / "mcp.mjs", scope, proc.pid, max_age),
                        )
                        if decision == "owned_tickle":
                            now_counters = read_counters()
                            if now_counters != previous_counters:
                                decision, changed, tickle_pid = activity.activity_decision(
                                    previous_idle, now_idle, previous_counters, now_counters, lambda _: None)
                        if decision != "idle":
                            activity.log_activity(artifacts / "idle-guard.jsonl", decision, previous_idle, now_idle, changed, tickle_pid)
                        if stop_file.exists() or decision not in ("idle", "owned_tickle"):
                            interrupted = "STOP file created" if stop_file.exists() else decision
                            break
                        previous_idle = now_idle
                        previous_counters = now_counters
            finally:
                owned_stop(desktop, proc)
        turn_cap_reached = "CU_BENCH_TURN_CAP_REACHED" in (artifacts / "pi.stderr").read_text("utf-8", errors="replace").splitlines()
        return {"exit_code": proc.returncode, "seconds": round(time.monotonic() - started, 2),
                "timed_out": timed_out, "turn_cap_reached": turn_cap_reached, "interrupted": interrupted}


def agent_facts(events, guard, v2, *, turn_cap_reached=False):
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
    # Pi 1.5 emits a synthetic assistant error for the turn hook's local abort.
    cap_abort = (turn_cap_reached and bool(assistant) and assistant[-1].get("stopReason") == "error"
                 and assistant[-1].get("errorMessage") == "This operation was aborted")
    responses = assistant[:-1] if cap_abort else assistant
    provider_error_count = sum(msg.get("stopReason") == "error" for msg in responses)
    normal_end = bool(responses) and (responses[-1].get("stopReason") == "stop" or
                                      cap_abort and responses[-1].get("stopReason") == "toolUse")
    return {"model_verified": identities == [(PROVIDER, MODEL)], "observed_models": identities,
            "turns": sum(e.get("type") == "turn_start" for e in events), "tool_calls": len(starts),
            "tool_errors": sum(e.get("type") == "tool_execution_end" and bool(e.get("isError")) for e in events),
            "gui_only_violations": sorted(violations), "gui_only": not violations and all(e.get("toolName") in TOOLS for e in starts),
            "provider_error": provider_error_count > 0 and not normal_end,
            "provider_error_count": provider_error_count, "usage": usage}


def run_trial(entry, condition, out, task, spec, bundle_ids, login, modules, *, appkit_key_bundles=(), appkit_click_bundles=()):
    pilot, v2, runner, desktop, cdb = modules
    seed = entry["seed"]
    attempt = journal.next_attempt(out, entry)
    trial = journal.attempt_dir(out, entry, attempt)
    artifacts = trial / "artifacts"
    artifacts.mkdir(parents=True)
    row = dict(entry, id=task.id, attempt=attempt, artifacts=str(artifacts), status="infrastructure_error")
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
                    prepare_pack_apps(pack, old_home)
                    pack.start_apps(force_accessibility=True)
                    for app, proc in zip(pack.apps(), pack.procs, strict=True):
                        if app["kind"] == "service":
                            wait_service(app["id"], proc, app["ready"])
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
                                     desktop, pilot.hid_idle_seconds, out / "STOP",
                                     allow_foreground_hover=condition == "foreground", appkit_key_bundles=appkit_key_bundles,
                                     appkit_click_bundles=appkit_click_bundles))
                sentinel.toggle_armed()
                armed = False
                row["disturbance"] = sentinel.summary()
                row["driver_isolation"] = json_lines(artifacts / "driver-isolation.jsonl")
                row["agent"] = agent_facts(json_lines(artifacts / "pi.jsonl"), json_lines(artifacts / "gui-guard.jsonl"), v2,
                                           turn_cap_reached=row["turn_cap_reached"])
                row["evaluation"] = pack.evaluate(row["exit_code"]) if pack else runner.evaluate_probe(
                    task, seed, paths, artifacts, sentinel.log)
                if row["interrupted"]:
                    raise RuntimeError(row["interrupted"])
                if not row["agent"]["model_verified"] or row["agent"]["provider_error"]:
                    raise RuntimeError("Pi did not confirm a successful response from the required provider/model")
                if not row["disturbance"].get("available") or "error" in row["evaluation"]:
                    raise RuntimeError("Sentinel or evaluator did not produce usable measurements")
                row["passed"] = bool(row["evaluation"]["passed"] and row["agent"]["gui_only"] and
                                     not row["timed_out"] and not row["turn_cap_reached"] and
                                     row["agent"]["turns"] <= max_turns and row["exit_code"] == 0)
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
        row.update(status="infrastructure_error", error=f"{type(error).__name__}: {error}")
    except (KeyboardInterrupt, SystemExit):
        row.update(status="infrastructure_error", error="Benchmark supervisor interrupted")
        raise
    finally:
        write_json(trial / "trial.json", row)
    result = f"RESULT {task.id} {row['status']}"
    if row["status"] == "scored":
        result += f" score={row['evaluation'].get('score')} task_passed={row['passed']}"
        if condition == "background":
            multiplayer = row["multiplayer"]
            criteria = multiplayer["criteria"]
            held = sum(value is True for value in criteria.values())
            result += f" A22_criteria={held}/{len(criteria)} background_completion={multiplayer['background_completion']}"
    print(result, flush=True)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    command = parser.add_mutually_exclusive_group()
    command.add_argument("--run", action="store_true", help="Run on a dedicated, unlocked desktop; the owned witness takes focus")
    command.add_argument("--prepare", action="store_true", help="Fetch and verify the pinned source, then build the owned fixtures")
    command.add_argument("--doctor", action="store_true", help="Check local prerequisites without starting a trial")
    parser.add_argument("--tasks", help="benchlab (default), v2 (all ten), or comma-separated IDs")
    parser.add_argument("--condition", choices=["background", "foreground", "both"])
    parser.add_argument("--runs", type=int, help="Replications per task and condition (default: 1)")
    parser.add_argument("--run-index", type=int, help="Select exactly one upstream replicate index (0–4)")
    parser.add_argument("--seed", type=int, help="Blocked task-order seed (default: 2026)")
    parser.add_argument("--resume", type=Path, help="Resume an existing report without repeating scored trials")
    parser.add_argument("--idle-seconds", type=float, default=10, help="Require this much hardware idle time before each trial")
    parser.add_argument("--allow-multi-app", action="store_true", help="Allow stock-app launches on a dedicated benchmark desktop")
    parser.add_argument("--appkit-key-bundle", action="append", metavar="BUNDLE_ID",
                        help="Allow explicit experimental AppKit key preparation for this owned app in background trials")
    parser.add_argument("--appkit-click-bundle", action="append", metavar="BUNDLE_ID",
                        help="Allow explicit experimental AppKit click preparation for this owned app in background trials")
    args = parser.parse_args()
    selection = (args.tasks, args.condition, args.runs, args.run_index, args.seed, args.appkit_key_bundle, args.appkit_click_bundle)
    if args.resume and (not args.run or any(value is not None for value in selection)):
        parser.error("--resume requires --run and uses the saved task selection, conditions, seeds and scoped input configuration")
    if args.run_index is not None and (args.runs is not None or not 0 <= args.run_index <= 4):
        parser.error("Use --run-index 0–4 without --runs")
    args.tasks = args.tasks or "benchlab"
    args.condition = args.condition or "background"
    args.runs = 1 if args.runs is None else args.runs
    args.seed = 2026 if args.seed is None else args.seed
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

    # The pinned pack defaults to Homebrew's PATH and /usr/local/bin/node.
    # Use the same resolved executable for fixtures, the evaluator and MCP.
    cdb.APP_PATH = str(Path(NODE).resolve().parent) + ":" + cdb.APP_PATH
    cdb.node_facts = partial(cdb.node_facts, NODE)

    tasks = runner.load_tasks(bench / "probes")
    saved = None
    if args.resume:
        out, saved = journal.load_resume(args.resume, ARTIFACTS)
        plan = saved["plan"]
        ids = list(dict.fromkeys(entry["task"] for entry in plan))
        args.seed = saved["schedule_seed"]
    elif args.tasks == "v2":
        ids = list(v2.V2_TASKS)
    elif args.tasks == "benchlab":
        ids = [tid for tid in v2.V2_TASKS if not tid.startswith("CDB-")]
    else:
        ids = args.tasks.split(",")
    if len(ids) != len(set(ids)) or any(tid not in v2.V2_TASKS for tid in ids):
        parser.error(f"Select distinct v2 tasks: {', '.join(v2.V2_TASKS)}")
    specs = {tid: json.loads((tasks[tid].probe_dir / "task.json").read_text("utf-8")) for tid in ids}
    problems = v2.validate_tasks(specs, ids)
    if problems:
        parser.error("; ".join(problems))
    if saved is None:
        runs = args.runs if args.run_index is None else args.run_index + 1
        schedule = pilot.build_schedule(ids, [ARM], runs, args.seed)
        if args.run_index is not None:
            schedule = [row for row in schedule if row["run_index"] == args.run_index]
        conditions = list(v2.CONDITIONS) if args.condition == "both" else [args.condition]
        plan = [dict(row, condition=condition, seed=pilot.probe_seed(row["task"], row["run_index"]))
                for row in schedule for condition in conditions]
        for index, entry in enumerate(plan):
            entry["order_index"] = index
    for index, entry in enumerate(plan):
        if (entry["order_index"] != index or entry["condition"] not in v2.CONDITIONS or entry["arm"] != ARM or
            not 0 <= entry["run_index"] <= 4 or entry["seed"] != pilot.probe_seed(entry["task"], entry["run_index"])):
            parser.error("Invalid benchmark trial plan")
    if not plan or len({(e['task'], e['condition'], e['run_index']) for e in plan}) != len(plan):
        parser.error("Empty or duplicate benchmark trial plan")
    appkit_key_bundles = sorted(set(saved.get("appkit_key_bundles", []) if saved else args.appkit_key_bundle or []))
    appkit_click_bundles = sorted(set(saved.get("appkit_click_bundles", []) if saved else args.appkit_click_bundle or []))
    scoped_bundles = set(appkit_key_bundles).union(appkit_click_bundles)
    if scoped_bundles and any(entry["condition"] != "background" for entry in plan):
        parser.error("Scoped AppKit key and click options are available only for background trials")
    report = {"journal_schema": journal.SCHEMA, "benchmark_version": 2, "upstream_commit": REVISION, "upstream_tree": tree, "arm": ARM,
              "provider": PROVIDER, "model": MODEL, "thinking": THINKING, "schedule_seed": args.seed, "plan": plan}
    if appkit_key_bundles:
        report["appkit_key_bundles"] = appkit_key_bundles
    if appkit_click_bundles:
        report["appkit_click_bundles"] = appkit_click_bundles
    if args.prepare:
        build_fixtures(bench)
        print(APPS)
        return 0
    if not (args.run or args.doctor):
        print(json.dumps(report, indent=2))
        return 0
    bundles, exclusive_bundles, missing, services = {}, {"ai.cua.benchlab", "ai.cua.benchsentinel"}, [], []
    node_version = capture(NODE, "--version")
    if int(node_version.lstrip("v").split(".")[0]) < 22:
        raise RuntimeError("The benchmark requires Node 22 or later")
    for tid, spec in specs.items():
        if spec.get("kind") == "cdb":
            bundles[tid], exclusive, deps, endpoints = pack_requirements(cdb, spec)
            exclusive_bundles.update(exclusive)
            missing.extend(deps)
            services.extend(endpoints)
        else:
            bundles[tid] = {"ai.cua.benchlab"}
    unknown_scoped_bundles = scoped_bundles.difference(*bundles.values())
    if unknown_scoped_bundles:
        parser.error("Scoped AppKit bundles must be owned by selected trials: " + ", ".join(sorted(unknown_scoped_bundles)))
    if missing:
        raise RuntimeError("Missing benchmark prerequisites:\n  " + "\n  ".join(sorted(set(missing))))
    for host, port in sorted({(endpoint.hostname, endpoint.port) for endpoint in services}):
        try:
            with socket.socket() as listener:
                listener.bind((host, port))
        except OSError as error:
            raise RuntimeError(f"Benchmark service port {host}:{port} is unavailable: {error}") from error
    login = pi_auth()
    status = inspect_bridge(set())
    if not all(status["permissions"].get(p) for p in ("accessibility", "screenRecording")):
        raise RuntimeError("Grant the existing native helper Accessibility and Screen Recording through macOS Settings")
    if args.doctor:
        print(json.dumps(dict(report, prerequisites="ready", node=node_version, pi_version=capture(login[0], "--version"), displays=status["displays"]), indent=2))
        return 0
    running_apps = inspect_bridge(exclusive_bundles)["apps"]
    if running_apps:
        names = ", ".join(sorted({app["bundleId"] for app in running_apps}))
        raise RuntimeError(f"Benchmark or unisolated stock apps already running: {names}")
    if any(spec.get("kind") == "cdb" for spec in specs.values()):
        if not args.allow_multi_app:
            parser.error("Use --allow-multi-app on a dedicated desktop for the stock-app workloads")
    build_fixtures(bench)
    identity = {"code_sha256": code_identity(), "native_sha256": hashlib.sha256(NATIVE.read_bytes()).hexdigest(),
                "fixture_sha256": {name: hashlib.sha256((APPS / f"{name}.app/Contents/MacOS/{name}").read_bytes()).hexdigest()
                                   for name in ("BenchLab", "BenchSentinel")},
                "node": node_version, "pi_version": capture(login[0], "--version"),
                "macos": platform.mac_ver()[0], "displays": status["displays"]}
    report.update(identity)
    if saved is None:
        out = ARTIFACTS / ("bench-v2-pi-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
        out.mkdir(parents=True, mode=0o700)
    else:
        journal.require_same_run(saved, report)
        if (out / "STOP").exists():
            raise RuntimeError("The saved run still has a STOP file. Remove it only when ready to resume.")
        report = saved
        report.pop("stop_reason", None)
    report.setdefault("project_commit", capture("git", "rev-parse", "HEAD") if (ROOT / ".git").exists() else None)
    report.setdefault("scope", "Local Pi arm, pinned task fixtures/checkers and A22 metrics. No official cross-arm run.")
    report["trials"] = journal.read_attempts(out, plan)
    done = {row["order_index"] for row in report["trials"] if row["status"] == "scored"}
    print(f"REPORT {out / 'summary.json'}", flush=True)
    write_json(out / "summary.json", report)
    try:
        for entry in plan:
            if entry["order_index"] in done:
                continue
            if pilot.wait_for_idle(args.idle_seconds, 60, out / "STOP") is None:
                report["stop_reason"] = "Desktop was not idle or STOP file was created"
                break
            row = run_trial(entry, entry["condition"], out, tasks[entry["task"]],
                            specs[entry["task"]], bundles[entry["task"]], login, (pilot, v2, runner, desktop, cdb),
                            appkit_key_bundles=appkit_key_bundles, appkit_click_bundles=appkit_click_bundles)
            report["trials"].append(row)
            write_json(out / "summary.json", report)
            if row["status"] == "infrastructure_error":
                report["stop_reason"] = row.get("error", "Infrastructure error")
                break
    finally:
        report["trials"] = journal.read_attempts(out, plan)
        report["totals"] = journal.totals(plan, report["trials"])
        write_json(out / "summary.json", report)
        print("TOTAL", json.dumps(report["totals"]), flush=True)
    return 0 if report["totals"]["remaining"] == 0 else 1


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(130))
    try:
        sys.exit(main())
    except (RuntimeError, OSError, sp.SubprocessError, ValueError) as error:
        print(f"bench:v2: {error}", file=sys.stderr)
        sys.exit(1)
