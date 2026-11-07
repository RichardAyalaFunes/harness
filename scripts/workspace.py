"""Small cooperative shared-record and worktree helper; no automatic publishing."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import subprocess
import sys


def git(*args, cwd=None):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True, encoding='utf-8').strip()


def locations():
    root = Path(git('rev-parse', '--show-toplevel')).resolve()
    common = Path(git('rev-parse', '--path-format=absolute', '--git-common-dir')).resolve()
    records = git('worktree', 'list', '--porcelain').split('\n\n')
    for record in records:
        lines = record.splitlines()
        if 'branch refs/heads/main' in lines:
            return root, Path(lines[0].removeprefix('worktree ')).resolve(), common / 'records.lock'
    raise ValueError('main must have a checked-out worktree')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('lock').add_argument('--owner', required=True, help='Unique chat/task ID')
    sub.add_parser('unlock').add_argument('--owner', required=True)
    sub.add_parser('info')
    new = sub.add_parser('new')
    new.add_argument('slug')
    new.add_argument('--vendor', choices=['codex', 'claude'], default='codex')
    checkpoint = sub.add_parser('checkpoint')
    checkpoint.add_argument('--message', required=True)
    checkpoint.add_argument('--paths', nargs='+', required=True)
    checkpoint.add_argument('--owner', required=True)
    args = parser.parse_args()
    root, canonical, lock = locations()
    if args.command == 'info':
        print(json.dumps({'worktree': str(root), 'main': str(canonical), 'lock': str(lock)}, indent=2))
        return
    if args.command == 'lock':
        lock.mkdir()  # Atomic; an existing lock is a failure, never overwritten.
        (lock / 'owner.json').write_text(json.dumps({'worktree': str(root), 'owner': args.owner, 'created': datetime.now().astimezone().isoformat()}), encoding='utf-8')
        print('Records lock acquired. Release after checkpoint with unlock.')
        return
    if lock.exists() and not (lock / 'owner.json').exists():
        raise ValueError(f'Incomplete or initializing lock at {lock}; verify owner before manual recovery')
    owner = json.loads((lock / 'owner.json').read_text(encoding='utf-8')) if lock.exists() else None
    if args.command == 'unlock':
        if not owner or Path(owner['worktree']) != root or owner.get('owner') != args.owner:
            raise ValueError('No lock owned by this worktree; inspect owner before recovery')
        (lock / 'owner.json').unlink()
        lock.rmdir()
        print('Records lock released')
        return
    if root != canonical or git('branch', '--show-current') != 'main':
        raise ValueError('Run this operation from the canonical main checkout')
    if args.command == 'new':
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.slug):
            raise ValueError('Use a lowercase kebab-case slug')
        if git('status', '--porcelain'):
            raise ValueError('Commit main changes first')
        if owner:
            raise ValueError('Shared records are locked; wait for the owner')
        task_id = datetime.now().strftime('%Y-%m-%d') + '-' + args.slug
        task = canonical / '_work' / task_id
        target = canonical.parent / (canonical.name + '-' + args.slug)
        if task.exists() or target.exists():
            raise ValueError('Task or worktree path already exists')
        # Lock covers Git worktree metadata and creation of shared task records.
        lock.mkdir()
        (lock / 'owner.json').write_text(json.dumps({'worktree': str(root)}), encoding='utf-8')
        try:
            print(git('worktree', 'add', '-b', 'work/' + args.slug, str(target), 'main'))
            task.mkdir(parents=True)
            (task / 'STATE.md').write_text(f'# {task_id}\n\nStatus: input\nBranch: work/{args.slug}\nWorktree: {target}\nNext: capture human input, questions and peer-reviewed plan.\n', encoding='utf-8')
            (task / f'record.{args.vendor}.md').write_text((canonical / '_work/TEMPLATE.md').read_text(encoding='utf-8'), encoding='utf-8')
        except Exception:
            print(f'Creation incomplete. Inspect {target} with git worktree list and {task}; preserve any files before manual recovery.', file=sys.stderr)
            raise
        finally:
            (lock / 'owner.json').unlink()
            lock.rmdir()
        print(f'Canonical record: {task}\nCheckpoint these new records on main before work.')
        return
    if not owner or Path(owner['worktree']) != root or owner.get('owner') != args.owner:
        raise ValueError('Acquire the records lock from main before checkpointing')
    if git('diff', '--cached', '--name-only'):
        raise ValueError('Index already has staged changes; preserve them and resolve manually')
    allowed = {'memory', 'knowledge', '_work', 'prompts'}
    paths = []
    for value in args.paths:
        path = (root / value).resolve()
        if not path.is_relative_to(root) or path.relative_to(root).parts[0] not in allowed:
            raise ValueError('Checkpoint accepts only explicit shared record files inside main')
        if not path.is_file():
            raise ValueError('Pass individual existing files; deletions require manual review')
        if path.suffix not in {'.md', '.html', '.json', '.jsonl', '.txt'}:
            raise ValueError('Checkpoint only supports record/artifact extensions; review other files manually')
        from privacy import check_text
        check_text(path.read_text(encoding='utf-8'), str(path))
        paths.append(path.relative_to(root).as_posix())
    git('--literal-pathspecs', 'add', '--', *paths)
    try:
        print(git('commit', '-m', args.message))
    except subprocess.CalledProcessError:
        git('--literal-pathspecs', 'reset', '-q', 'HEAD', '--', *paths)
        raise


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
