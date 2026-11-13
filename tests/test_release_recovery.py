import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recovery', ROOT / 'tools/release_recovery.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        def git(*args):
            return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True).strip()
        self.git = git
        git('init', '-q')
        (self.repo / 'index.html').write_text('original release')
        git('add', 'index.html')
        git('-c', 'user.name=Recovery Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
        self.commit = git('rev-parse', 'HEAD')
        (self.repo / 'index.html').write_text('dirty content must not be archived')
        (self.repo / 'credential.json').write_text('untracked synthetic secret')
        self.package = self.base / 'package'
        r.create(self.repo, self.commit, self.package)
        self.anchor = r.sha((self.package / 'manifest.json').read_bytes())

    def test_exact_committed_source_restored_without_untracked_or_dirty_files(self):
        target = self.base / 'restored'
        self.assertEqual(r.restore(self.package, target, self.commit, self.anchor), 1)
        self.assertEqual((target / 'index.html').read_text(), 'original release')
        self.assertFalse((target / 'credential.json').exists())

    def test_archive_corruption_rejected_before_restore(self):
        with (self.package / 'release.zip').open('ab') as f:
            f.write(b'corruption')
        with self.assertRaises(ValueError):
            r.restore(self.package, self.base / 'restored', self.commit, self.anchor)
        self.assertFalse((self.base / 'restored').exists())

    def test_modified_manifest_rejected_by_independent_anchor(self):
        (self.package / 'manifest.json').write_text('{}')
        with self.assertRaises(ValueError):
            r.verify(self.package, self.commit, self.anchor)

    def test_wrong_commit_and_symbolic_refs_rejected(self):
        with self.assertRaises(ValueError):
            r.verify(self.package, '0' * 40, self.anchor)
        with self.assertRaises(ValueError):
            r.create(self.repo, 'main', self.base / 'second')

    def test_existing_target_never_overwritten(self):
        target = self.base / 'existing'
        target.mkdir()
        (target / 'keep').write_text('keep')
        with self.assertRaises(ValueError):
            r.restore(self.package, target, self.commit, self.anchor)
        self.assertEqual((target / 'keep').read_text(), 'keep')

    def test_path_traversal_and_symlinks_rejected(self):
        for name in ['../escape', '/absolute', 'C:/file', 'a\\b']:
            data = io.BytesIO()
            with zipfile.ZipFile(data, 'w') as archive:
                archive.writestr(name, 'synthetic')
            with self.assertRaises(ValueError):
                r.entries(data.getvalue())
        link = self.base / 'link'
        link.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(ValueError):
            r.restore(self.package, link / 'child', self.commit, self.anchor)

    def test_inventory_mismatch_rejected_even_with_new_manifest_anchor(self):
        manifest_path = self.package / 'manifest.json'
        m = json.loads(manifest_path.read_text())
        m['files'] = {}
        manifest_path.write_text(json.dumps(m))
        with self.assertRaises(ValueError):
            r.verify(self.package, self.commit, r.sha(manifest_path.read_bytes()))


if __name__ == '__main__':
    unittest.main()
