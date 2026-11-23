import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = 8784
ORIGIN = f"http://127.0.0.1:{PORT}"
LEGACY_SNAPSHOT = "csv"
EXPANDED_SNAPSHOT = "csv-expanded-v2"
DATETIME_SNAPSHOT = "csv-expanded-v2-datetime"
SNAPSHOT_POINTER = "active-snapshot"


def private_home():
    return Path(os.environ["LOCALAPPDATA"]) / "RDWDW" / "ReportBuilderPilot"


def active_snapshot(home):
    try:
        name = (home / SNAPSHOT_POINTER).read_text(encoding="ascii").strip()
    except FileNotFoundError:
        name = LEGACY_SNAPSHOT
    if name not in (LEGACY_SNAPSHOT, EXPANDED_SNAPSHOT, DATETIME_SNAPSHOT):
        raise ValueError("Unknown active snapshot.")
    return home / name
