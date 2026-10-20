#!/usr/bin/env python3
import os
import sqlite3
import time
from pathlib import Path

os.umask(0o077)
directory=Path('/var/lib/qiaomu-x-community/backups')
directory.mkdir(mode=0o700,exist_ok=True)
path=directory/time.strftime('%Y-%m-%d.sqlite',time.gmtime())
source=sqlite3.connect('/var/lib/qiaomu-x-community/community.sqlite')
target=sqlite3.connect(path)
try:
    source.backup(target)
finally:
    source.close()
    target.close()
for old in directory.glob('*.sqlite'):
    if old.stat().st_mtime < time.time()-8*86400:
        old.unlink()
