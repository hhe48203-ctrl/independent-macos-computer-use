"""Distinguish actual HID input from an owned WindowServer activity tickle."""

import ctypes
import json
from pathlib import Path
import re
import subprocess

HID_TYPES = (1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 22, 23, 24, 25, 26, 27)
TICKLE = re.compile(
    r'\b(\d+):(\d+):(\d+) UserIsActive named: "[^"\n]*?queue\.tickle\.nxevent '
    r'service:IOHIDSystem pid:(\d+) process:computer-use-bridge"'
)


def hid_counter_reader():
    cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
    counter = cg.CGEventSourceCounterForEventType
    counter.argtypes = (ctypes.c_int32, ctypes.c_uint32)
    counter.restype = ctypes.c_uint32
    # 1 is kCGEventSourceStateHIDSystemState. Process-directed private-state
    # packets must not be mistaken for real HID input.
    return lambda: tuple(counter(1, kind) for kind in HID_TYPES)


def recent_tickle_pids(assertions, max_age):
    return {int(pid) for hours, minutes, seconds, pid in TICKLE.findall(assertions)
            if 3600 * int(hours) + 60 * int(minutes) + int(seconds) <= max_age}


def owned_tickle(helper, server, scope, agent_pid, max_age):
    def ps(pid, field):
        return subprocess.check_output(["/bin/ps", "-ww", "-p", str(pid), "-o", field + "="],
                                       stderr=subprocess.DEVNULL, text=True, timeout=2).strip()

    try:
        assertions = subprocess.check_output(["/usr/bin/pmset", "-g", "assertions"],
                                             stderr=subprocess.DEVNULL, text=True, timeout=3)
        pids = recent_tickle_pids(assertions, max_age)
        if len(pids) != 1:
            return None
        pid = pids.pop()
        if Path(ps(pid, "comm")).resolve() != helper.resolve():
            return None
        parent = int(ps(pid, "ppid"))
        command = ps(parent, "command")
        if not command.endswith(f" {server} --serve {scope}"):
            return None
        # Pi's MCP transport starts a separate process group. The direct
        # parent chain and exact trial scope, not group equality, prove origin.
        for _ in range(12):
            if parent == agent_pid:
                return pid
            if parent <= 1:
                break
            parent = int(ps(parent, "ppid"))
        return None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def activity_decision(previous_idle, idle, before, after, find_tickle):
    changed = [kind for kind, old, new in zip(HID_TYPES, before, after) if old != new]
    reset = idle + 0.75 < previous_idle
    if changed:
        return "physical_hid", changed, None
    if not reset:
        return "idle", changed, None
    pid = find_tickle(idle + 1)
    return ("owned_tickle" if pid else "unattributed_idle_reset"), changed, pid


def log_activity(file, decision, previous_idle, idle, changed, pid):
    with file.open("a", encoding="utf-8") as log:
        print(json.dumps({"decision": decision, "previous_iokit_seconds": previous_idle,
                          "iokit_seconds": idle, "physical_hid_counter_changes": changed,
                          "owned_tickle_pid": pid}), file=log)
