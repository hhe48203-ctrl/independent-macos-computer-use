import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/bench-v2"))
import journal
with patch.dict("os.environ", {"CU_BENCH_NODE": "node"}):
    from run import MODEL, PROVIDER, agent_facts


class BenchmarkJournalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.out = self.root / "run"
        self.out.mkdir()
        self.entry = dict(task="MB-09", condition="background", seed=790113, arm="pi-terra-independent-macos",
                          order_index=0, run_index=0)

    def attempt(self, number, **fields):
        directory = journal.attempt_dir(self.out, self.entry, number)
        directory.mkdir()
        (directory / "trial.json").write_text(json.dumps(dict(self.entry, attempt=number, **fields)))

    def test_recover_scored_failure_and_keep_infrastructure_separate(self):
        self.attempt(1, status="infrastructure_error", error="provider unavailable")
        journal.attempt_dir(self.out, self.entry, 2).mkdir()
        self.attempt(3, status="scored", passed=False, multiplayer={"background_completion": False})
        attempts = journal.read_attempts(self.out, [self.entry])
        self.assertEqual([r['status'] for r in attempts], ['infrastructure_error', 'infrastructure_error', 'scored'])
        self.assertEqual(journal.totals([self.entry], attempts), dict(planned=1, scored=1, passed=0,
                         background_scored=1, background_completion=0, infrastructure_attempts=2, remaining=0))
        self.assertEqual(journal.next_attempt(self.out, self.entry), 4)

    def test_reject_changed_model_or_build_and_duplicate_scores(self):
        with self.assertRaisesRegex(ValueError, "native_sha256"):
            journal.require_same_run({"native_sha256": "old"}, {"native_sha256": "new"})
        self.attempt(1, status="scored", passed=True)
        self.attempt(2, status="scored", passed=True)
        with self.assertRaisesRegex(ValueError, "Duplicate scored"):
            journal.read_attempts(self.out, [self.entry])

    def test_old_results_use_seed_reproduction_not_resume(self):
        (self.out / "summary.json").write_text('{"plan": []}')
        with self.assertRaisesRegex(ValueError, "--run-index"):
            journal.load_resume(self.out, self.root)


class ProviderOutcomeTest(unittest.TestCase):
    def test_provider_errors_require_a_later_normal_end_to_count_as_recovered(self):
        cases = (
            (("toolUse", "stop"), 0, False),
            (("error", "toolUse", "error", "stop"), 2, False),
            (("toolUse", "error"), 1, True),
            (("stop", "error"), 1, True),
            (("error", "toolUse"), 1, True),
        )
        for reasons, count, failed in cases:
            with self.subTest(reasons=reasons):
                events = [{"type": "message_end", "message": {
                    "role": "assistant", "provider": PROVIDER, "model": MODEL, "stopReason": reason,
                }} for reason in reasons]
                facts = agent_facts(events, [], None)
                self.assertTrue(facts["model_verified"])
                self.assertEqual(facts["provider_error"], failed)
                self.assertEqual(facts["provider_error_count"], count)

    def test_recovered_provider_error_still_requires_the_exact_model(self):
        events = [{"type": "message_end", "message": {
            "role": "assistant", "provider": PROVIDER, "model": model, "stopReason": reason,
        }} for model, reason in (("other-model", "error"), (MODEL, "stop"))]
        facts = agent_facts(events, [], None)
        self.assertFalse(facts["provider_error"])
        self.assertFalse(facts["model_verified"])

    def test_local_turn_cap_excludes_only_the_confirmed_abort(self):
        events = [{"type": "message_end", "message": {
            "role": "assistant", "provider": PROVIDER, "model": MODEL,
            "stopReason": reason, "errorMessage": message,
        }} for reason, message in (("error", "Provider overloaded"), ("toolUse", None),
                                   ("error", "This operation was aborted"))]
        facts = agent_facts(events, [], None, turn_cap_reached=True)
        self.assertTrue(facts["model_verified"])
        self.assertFalse(facts["provider_error"])
        self.assertEqual(facts["provider_error_count"], 1)
        self.assertTrue(agent_facts(events, [], None)["provider_error"])
        events[-1]["message"]["errorMessage"] = "The usage limit has been reached"
        self.assertTrue(agent_facts(events, [], None, turn_cap_reached=True)["provider_error"])

    def test_terminal_pi_usage_limit_is_distinct_from_overload_and_recovery(self):
        def event(reason, error=None, model=MODEL):
            return {"type": "message_end", "message": {"role": "assistant", "provider": PROVIDER,
                    "model": model, "stopReason": reason, "errorMessage": error}}

        quota = "Codex error: The usage limit has been reached"
        self.assertTrue(agent_facts([event("error", quota)], [], None)["provider_usage_limit"])
        for events in ([event("error", "Provider overloaded")],
                       [event("error", quota, model="other-model")],
                       [event("error", quota), event("stop")]):
            self.assertFalse(agent_facts(events, [], None)["provider_usage_limit"])
