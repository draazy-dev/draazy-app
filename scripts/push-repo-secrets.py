"""Push one environment's rows from the local secrets workbook to GitHub repo-level secrets and variables.

A private repo on GitHub Free has no environment secrets, so every value is repo-level and prefixed.
Values are piped to gh on stdin and never printed. Needs openpyxl and gh logged in as a repo admin.
Usage: python3 scripts/push-repo-secrets.py SANDBOX|PROD [--dry-run] [--file PATH]
"""
import argparse
import os
import subprocess
import sys

from openpyxl import load_workbook

REPO = "draazy-dev/draazy-app"

ap = argparse.ArgumentParser()
ap.add_argument("env", choices=["SANDBOX", "PROD"])
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--file", default=os.path.expanduser("~/Draazy-Secrets/draazy-secrets.xlsx"))
a = ap.parse_args()

ws = load_workbook(a.file, read_only=True)["Secrets"]
rows = list(ws.iter_rows(min_row=2, values_only=True))
missing = []
for env, kind, name, value, *_ in rows:
    if env not in (a.env, "SHARED") or not name:
        continue
    if value in (None, ""):
        missing.append(name)
        continue
    if a.dry_run:
        print(f"would set {kind} {name}")
        continue
    cmd = ["gh", kind, "set", name, "-R", REPO]
    if kind == "variable":
        cmd += ["--body", str(value)]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    else:
        subprocess.run(cmd, input=str(value).strip(), text=True, check=True, stdout=subprocess.DEVNULL)
    print(f"set {kind} {name}")

if missing:
    print("\nEmpty in the workbook, not set:\n  " + "\n  ".join(missing), file=sys.stderr)
