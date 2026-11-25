"""Run the maintained regression suite. All commands use this checkout's paths."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser',action='store_true',help='Also exercise a real page, full scan, accuracy switch and cancellation')
    args=parser.parse_args()
    node=shutil.which('node')
    if not node:raise SystemExit('Node.js (node) is required on PATH for the frontend regression suite')
    commands=[
        [sys.executable,'-m','unittest','discover','-s','tests/backend','-p','test_*.py','-v'],
        [sys.executable,'tests/backend/test_explicit_scan.py'],
        [sys.executable,'tests/backend/test_partial_scan.py'],
        [sys.executable,'-m','unittest','discover','-s','tests/integration','-p','test_server_startup.py','-v'],
        [node,'--test',*[str(path.relative_to(ROOT)) for path in sorted((ROOT/'tests'/'frontend').glob('*.test.mjs'))]],
    ]
    if args.browser:commands.append([sys.executable,'tests/integration/test_chapter1.py'])
    for command in commands:
        print('Running:',subprocess.list2cmdline(command),flush=True)
        subprocess.run(command,cwd=ROOT,check=True)

if __name__=='__main__':main()
