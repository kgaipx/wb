import os
import sys
import tarfile

BACKEND = r"C:\Users\hp\WorkBuddy\2026-08-04-15-27-40\gwy-platform\backend"
EXCLUDE_DIRS = {"data", "__pycache__", "scripts_fix", ".venv", "venv"}
EXCLUDE_FILE_PREFIXES = ("_preview_ocr",)
EXCLUDE_FILE_SUFFIXES = (".pyc", ".db-wal", ".db-shm", ".db")

os.chdir(BACKEND)
with tarfile.open(fileobj=sys.stdout.buffer, mode="w:gz") as tf:
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fn in files:
            if any(fn.endswith(s) for s in EXCLUDE_FILE_SUFFIXES):
                continue
            if any(fn.startswith(p) for p in EXCLUDE_FILE_PREFIXES):
                continue
            full = os.path.join(root, fn)
            tf.add(full, arcname=full)
