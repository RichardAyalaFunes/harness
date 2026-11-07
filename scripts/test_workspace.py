"""Behavioral checks for destructive/concurrent Git failure boundaries in a temp repo."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('workspace.py')


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Workspace Test')
        self.git('config', 'user.email', 'test@example.invalid')
        (self.root / 'memory').mkdir()
        (self.root / 'memory/STATE.md').write_text('initial')
        (self.root / '_work').mkdir()
        (self.root / '_work/TEMPLATE.md').write_text('# task')
        (self.root / 'product.txt').write_text('initial')
        self.git('add', '.')
        self.git('commit', '-m', 'test baseline')

    def tearDown(self):
        # Windows Git can leave read-only metadata in TemporaryDirectory.
        def writable(func, path, error):
            Path(path).chmod(0o700)
            func(path)
        shutil.rmtree(self.temp.name, onerror=writable)
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True, stderr=subprocess.DEVNULL).strip()

    def run_helper(self, *args, ok=True, cwd=None):
        result = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd or self.root, text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def test_lock_owner_and_exclusion(self):
        self.run_helper('lock', '--owner', 'chat-a')
        self.run_helper('lock', '--owner', 'chat-b', ok=False)
        self.run_helper('unlock', '--owner', 'chat-b', ok=False)
        self.run_helper('unlock', '--owner', 'chat-a')

    def test_checkpoint_scopes_and_existing_index(self):
        (self.root / 'memory/STATE.md').write_text('new evidence')
        (self.root / 'product.txt').write_text('unrelated change')
        self.run_helper('lock', '--owner', 'chat-a')
        base = ['checkpoint', '--owner', 'chat-a', '--message', 'record', '--paths']
        self.run_helper(*base, 'product.txt', ok=False)
        self.run_helper(*base, '../outside.md', ok=False)
        self.run_helper(*base, '.', ok=False)
        self.run_helper('checkpoint', '--owner', 'chat-b', '--message', 'bad', '--paths', 'memory/STATE.md', ok=False)
        self.git('add', 'product.txt')
        self.run_helper(*base, 'memory/STATE.md', ok=False)
        self.assertEqual(self.git('diff', '--cached', '--name-only'), 'product.txt')
        self.git('restore', '--staged', 'product.txt')
        self.run_helper(*base, 'memory/STATE.md')
        self.assertEqual(self.git('show', '--format=', '--name-only', 'HEAD'), 'memory/STATE.md')
        self.assertIn('product.txt', self.git('status', '--porcelain'))
        self.run_helper('unlock', '--owner', 'chat-a')

    def test_worktree_and_canonical_main_discovery(self):
        self.run_helper('new', 'bad/slug', ok=False)
        self.run_helper('new', 'example')
        target = self.root.parent / 'repo-example'
        self.assertTrue(target.exists())
        self.assertIn('work/example', self.git('worktree', 'list'))
        result = self.run_helper('info', cwd=target)
        self.assertIn(str(self.root).replace('\\', '\\\\'), result.stdout)
        self.run_helper('new', 'other', cwd=target, ok=False)
        self.run_helper('lock', '--owner', 'feature-chat', cwd=target, ok=False)
        self.assertTrue(list((self.root / '_work').glob('*example/STATE.md')))

    def test_commit_failure_preserves_edits_and_clears_owned_index(self):
        (self.root / 'memory/STATE.md').write_text('new evidence')
        self.git('config', 'commit.gpgsign', 'true')
        self.git('config', 'gpg.program', 'nonexistent-test-signer')
        self.run_helper('lock', '--owner', 'chat-a')
        self.run_helper('checkpoint', '--owner', 'chat-a', '--message', 'record', '--paths', 'memory/STATE.md', ok=False)
        self.assertEqual(self.git('diff', '--cached', '--name-only'), '')
        self.assertEqual((self.root / 'memory/STATE.md').read_text(), 'new evidence')
        self.run_helper('unlock', '--owner', 'chat-a')

    def test_incomplete_lock_fails_with_recovery_message(self):
        (self.root / '.git/records.lock').mkdir()
        result = self.run_helper('unlock', '--owner', 'chat-a', ok=False)
        self.assertIn('verify owner', result.stderr)


if __name__ == '__main__':
    unittest.main()
