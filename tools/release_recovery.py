"""Offline source recovery only. Never invokes Firebase or runs restored application code."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def entries(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        result = {}
        for item in archive.infolist():
            path = PurePosixPath(item.filename)
            if (path.is_absolute() or '..' in path.parts or '\\' in item.filename
                    or ':' in item.filename or item.filename in result
                    or (item.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe or duplicate archive entry')
            if not item.is_dir():
                result[item.filename] = archive.read(item)
        return result


def create(repo, commit, destination):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Use an exact 40-character commit SHA')
    actual = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', '--verify', commit + '^{commit}'], text=True).strip()
    if actual != commit:
        raise ValueError('Commit mismatch')
    data = subprocess.check_output(['git', '-C', str(repo), 'archive', '--format=zip', commit])
    files = entries(data)
    manifest = {'format': 1, 'scope': 'git-source-only', 'commit': commit,
                'archive_sha256': sha(data),
                'files': {name: sha(value) for name, value in sorted(files.items())}}
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    (destination / 'release.zip').write_bytes(data)
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def verify(package, expected_commit, expected_manifest_sha256):
    package = Path(package)
    raw = (package / 'manifest.json').read_bytes()
    if sha(raw) != expected_manifest_sha256:
        raise ValueError('Manifest anchor mismatch')
    manifest = json.loads(raw)
    if (manifest.get('format') != 1 or manifest.get('scope') != 'git-source-only'
            or manifest.get('commit') != expected_commit):
        raise ValueError('Manifest identity mismatch')
    data = (package / 'release.zip').read_bytes()
    if sha(data) != manifest['archive_sha256']:
        raise ValueError('Archive checksum mismatch')
    files = entries(data)
    if {name: sha(value) for name, value in sorted(files.items())} != manifest['files']:
        raise ValueError('File inventory mismatch')
    return files


def restore(package, destination, commit, anchor):
    files = verify(package, commit, anchor)
    destination = Path(destination)
    # A new directory only: no overwrite, no existing symlink ancestors.
    if destination.exists() or destination.is_symlink():
        raise ValueError('Restore target must not exist')
    if any(parent.is_symlink() for parent in destination.parents):
        raise ValueError('Restore target has symlink ancestor')
    destination.mkdir(parents=True)
    for name, value in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value)
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    make = sub.add_parser('create')
    make.add_argument('--repo', required=True, type=Path)
    make.add_argument('--commit', required=True)
    make.add_argument('--out', required=True, type=Path)
    for action in ['verify', 'restore']:
        cmd = sub.add_parser(action)
        cmd.add_argument('--package', required=True, type=Path)
        cmd.add_argument('--commit', required=True)
        cmd.add_argument('--manifest-sha256', required=True)
        if action == 'restore':
            cmd.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.action == 'create':
        manifest = create(args.repo, args.commit, args.out)
        print(json.dumps({'commit': manifest['commit'], 'files': len(manifest['files']),
                          'manifest_sha256': sha((args.out / 'manifest.json').read_bytes()),
                          'scope': manifest['scope']}))
    elif args.action == 'verify':
        print('Verified files:', len(verify(args.package, args.commit, args.manifest_sha256)))
    else:
        print('Restored files:', restore(args.package, args.out, args.commit, args.manifest_sha256))


if __name__ == '__main__':
    main()
