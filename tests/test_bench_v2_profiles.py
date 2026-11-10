from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/bench-v2"))
with patch.dict("os.environ", {"CU_BENCH_NODE": "node"}):
    from run import prepare_app_profile, prepare_pack_apps, workspace_profile


class BenchmarkProfileTest(unittest.TestCase):
    def test_occlusion_flag_is_added_once_only_for_owned_electron_apps(self):
        flag = "--disable-backgrounding-occluded-windows"
        electron = {"kind": "electron", "command": ["npm", "exec", "--", "electron", "."]}
        browser = {"kind": "browser", "command": ["Chrome"]}
        pack = SimpleNamespace(apps=lambda: [electron, browser])
        prepare_pack_apps(pack, "/Users/example")
        prepare_pack_apps(pack, "/Users/example")
        self.assertEqual(electron["command"], ["npm", "exec", "--", "electron", ".", flag])
        self.assertEqual(browser["command"], ["Chrome"])

    def test_chrome_requires_one_unambiguous_workspace_local_flag(self):
        def profile(*args):
            return workspace_profile({"command": ["Chrome", *args]}, "--user-data-dir", "workspace")

        flag = "--user-data-dir=${workspace}/.runtime/browser"
        self.assertEqual(profile(flag), Path(".runtime/browser"))
        for args in ((), (flag, flag), (flag, "--user-data-dir", "/tmp/personal"),
                     ("--user-data-dir=/tmp/personal",), ("--user-data-dir=${workspace}/.runtime/../browser",),
                     ("--user-data-dir=${workspace}/.runtime/%2e%2e/browser",)):
            self.assertIsNone(profile(*args), args)

    def test_profile_may_be_empty_but_cannot_contain_state_or_follow_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            profile = workspace / ".runtime/libreoffice"
            profile.mkdir(parents=True)
            pack = SimpleNamespace(workspace=workspace)
            app = {"id": "calc", "command": ["soffice", "-env:UserInstallation=${workspace_uri}/.runtime/libreoffice"]}
            def prepare():
                return prepare_app_profile(pack, app, "-env:UserInstallation", "workspace_uri")

            self.assertEqual(prepare(), profile)
            config = profile / "profile"
            config.touch()
            with self.assertRaisesRegex(RuntimeError, "fresh trial-local"):
                prepare()
            config.unlink()
            profile.rmdir()
            profile.symlink_to(Path(temp) / "other", target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "fresh trial-local"):
                prepare()

    def test_login_home_is_used_only_for_chrome_with_an_explicit_isolated_profile(self):
        with tempfile.TemporaryDirectory() as temp:
            browser = {"id": "browser", "kind": "browser", "command": ["/Applications/Google Chrome", "--user-data-dir=${workspace}/.runtime/chrome"]}
            default_browser = {"id": "default", "kind": "browser", "command": ["/Applications/Google Chrome"]}
            pack = SimpleNamespace(workspace=Path(temp), apps=lambda: [browser, default_browser])
            prepare_pack_apps(pack, "/Users/example")
            self.assertEqual(browser["env"], {"HOME": "/Users/example"})
            self.assertIn("--disable-updater-scheduler", browser["command"])
            self.assertNotIn("env", default_browser)
