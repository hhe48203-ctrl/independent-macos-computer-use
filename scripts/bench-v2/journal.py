"""Recover complete trial records without replaying already scored work."""

import json
from pathlib import Path

SCHEMA = 2
TRIAL_KEYS = ("order_index", "task", "condition", "run_index", "seed", "arm")


def load_resume(path, artifacts_root):
    path = Path(path).expanduser().resolve()
    if path.is_dir():
        path /= "summary.json"
    if path.name != "summary.json" or path.parent.parent != artifacts_root.resolve():
        raise ValueError("Resume requires a bench:v2 summary.json directly under the repository artifacts directory")
    report = json.loads(path.read_text("utf-8"))
    if report.get("journal_schema") != SCHEMA or not isinstance(report.get("plan"), list):
        raise ValueError("This report predates resumable journals. Reproduce an old failure with --run-index instead.")
    return path.parent, report


def require_same_run(saved, current):
    mismatches = [key for key in current if saved.get(key) != current[key]]
    if mismatches:
        raise ValueError("Cannot resume with a changed benchmark identity: " + ", ".join(mismatches))


def trial_stem(entry):
    return f"{entry['order_index']:03d}-{entry['task']}-{entry['condition']}"


def attempt_dir(out, entry, attempt):
    suffix = "" if attempt == 1 else f"-attempt-{attempt:02d}"
    return out / (trial_stem(entry) + suffix)


def next_attempt(out, entry):
    attempt = 1
    while attempt_dir(out, entry, attempt).exists():
        attempt += 1
    return attempt


def read_attempts(out, plan):
    attempts = []
    for entry in plan:
        scored = False
        for attempt in range(1, next_attempt(out, entry)):
            result = attempt_dir(out, entry, attempt) / "trial.json"
            if not result.is_file():
                # A hard stop between creating artifacts and committing the row.
                attempts.append(dict(entry, id=entry['task'], attempt=attempt, status="infrastructure_error",
                                     error="Previous runner stopped before committing a trial record"))
                continue
            row = json.loads(result.read_text("utf-8"))
            if row.get("attempt") != attempt or any(row.get(k) != entry[k] for k in TRIAL_KEYS):
                raise ValueError(f"Trial record does not match its plan: {result}")
            if row.get("status") not in {"scored", "infrastructure_error"}:
                raise ValueError(f"Unrecognized trial status: {result}")
            if row["status"] == "scored":
                if scored:
                    raise ValueError(f"Duplicate scored trial: {trial_stem(entry)}")
                scored = True
            attempts.append(row)
    return attempts


def totals(plan, attempts):
    rows = [row for row in attempts if row["status"] == "scored"]
    background = [row for row in rows if row["condition"] == "background"]
    return {"planned": len(plan), "scored": len(rows), "passed": sum(row["passed"] for row in rows),
            "background_scored": len(background),
            "background_completion": sum(row["multiplayer"]["background_completion"] for row in background),
            "infrastructure_attempts": len(attempts) - len(rows), "remaining": len(plan) - len(rows)}
