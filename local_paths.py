import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = 8784
ORIGIN = f"http://127.0.0.1:{PORT}"
LEGACY_SNAPSHOT = "csv"
EXPANDED_SNAPSHOT = "csv-expanded-v2"
DATETIME_SNAPSHOT = "csv-expanded-v2-datetime"
WAREHOUSE_SNAPSHOT = "csv-expanded-v2-warehouse"
SNAPSHOT_POINTER = "active-snapshot"
BUNDLED_SNAPSHOT = HERE / "bundled-snapshot"


def private_home():
    override = os.environ.get("REPORT_BUILDER_HOME")
    if override:
        path = Path(override)
        if not path.is_absolute():
            raise ValueError("REPORT_BUILDER_HOME must be an absolute path.")
        return path
    return Path(os.environ["LOCALAPPDATA"]) / "RDWDW" / "ReportBuilderPilot"


def active_snapshot(home):
    try:
        name = (home / SNAPSHOT_POINTER).read_text(encoding="ascii").strip()
    except FileNotFoundError:
        legacy = home / LEGACY_SNAPSHOT
        return legacy if legacy.exists() else BUNDLED_SNAPSHOT
    if name not in (LEGACY_SNAPSHOT, EXPANDED_SNAPSHOT, DATETIME_SNAPSHOT, WAREHOUSE_SNAPSHOT):
        raise ValueError("Unknown active snapshot.")
    return home / name
