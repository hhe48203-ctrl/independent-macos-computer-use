from pathlib import Path
import sys
import unittest
from unittest.mock import patch

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

    def test_tickle_attribution_uses_trial_scope_and_agent_ancestry(self):
        helper, server, scope = map(Path, ('/test/helper', '/test/mcp.mjs', '/test/trial/scope.json'))
        info = {(34, 'comm='): str(helper), (34, 'ppid='): '33',
                (33, 'command='): f'node {server} --serve {scope}', (33, 'ppid='): '32',
                (32, 'ppid='): '1'}

        def output(command, **_):
            if command[0].endswith('pmset'):
                return '00:00:00 UserIsActive named: "com.apple.iohideventsystem.queue.tickle.nxevent service:IOHIDSystem pid:34 process:computer-use-bridge"'
            return info[int(command[3]), command[5]]

        with patch.object(activity.subprocess, 'check_output', side_effect=output):
            self.assertEqual(activity.owned_tickle(helper, server, scope, 32, 1), 34)
            self.assertIsNone(activity.owned_tickle(helper, server, scope, 99, 1))
            self.assertIsNone(activity.owned_tickle(helper, server, scope.with_name('other.json'), 32, 1))
