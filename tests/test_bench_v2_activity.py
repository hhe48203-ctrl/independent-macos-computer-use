from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/bench-v2"))
import activity


class ActivityGuardTest(unittest.TestCase):
    def test_same_hid_counters_require_attributed_idle_reset(self):
        counters = (12,) * len(activity.HID_TYPES)
        self.assertEqual(activity.activity_decision(20, 0.8, counters, counters, lambda _: 34),
                         ("owned_tickle", [], 34))
        self.assertEqual(activity.activity_decision(20, 0.8, counters, counters, lambda _: None),
                         ("unattributed_idle_reset", [], None))

    def test_input_interrupts_even_with_owned_tickle_or_no_idle_reset(self):
        before = (12,) * len(activity.HID_TYPES)
        after = (13,) + before[1:]
        for idle in (0.8, 21):
            self.assertEqual(activity.activity_decision(20, idle, before, after, lambda _: 34),
                             ("physical_hid", [1], None))

    def test_assertion_freshness_and_type(self):
        recent = 'pid 400(WindowServer): [0x01] 00:00:01 UserIsActive named: "com.apple.iohideventsystem.queue.tickle.nxevent service:IOHIDSystem pid:34 process:computer-use-bridge"'
        stale = recent.replace('00:00:01', '00:00:12').replace('pid:34', 'pid:99')
        unrelated = recent.replace('computer-use-bridge', 'Other').replace('pid:34', 'pid:17')
        self.assertEqual(activity.recent_tickle_pids('\n'.join([recent, stale, unrelated]), 2), {34})
