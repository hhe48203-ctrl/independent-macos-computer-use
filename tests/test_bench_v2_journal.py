import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/bench-v2"))
import journal


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
