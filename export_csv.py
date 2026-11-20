"""Export one read-only warehouse snapshot to the user's private pilot directory."""

import csv
import json
import os
import shutil
import subprocess
import tempfile
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from csv_source import CsvSnapshot, file_hash
from local_paths import HERE, private_home
from model import CSV_COLUMNS


def warehouse_environment():
    url = os.environ.get("RDWDW_URL")
    if not url:
        env_file = Path(os.environ.get("RDWDW_ENV_FILE", HERE.parents[1] / "rdwdw" / ".env"))
        if not env_file.is_file():
            raise RuntimeError("Set RDWDW_URL or provide the warehouse .env path in RDWDW_ENV_FILE.")
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("RDWDW_URL="):
                url = line.partition("=")[2].strip().strip("\"'")
                break
    if not url:
        raise RuntimeError("Set RDWDW_URL for the export process.")
    source = urlsplit(url)
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    env.update(PGHOST=source.hostname, PGPORT=str(source.port or 5432),
               PGDATABASE=unquote(source.path.lstrip("/")), PGUSER=unquote(source.username or ""),
               PGPASSWORD=unquote(source.password or ""), PGCONNECT_TIMEOUT="8", PGCLIENTENCODING="UTF8",
               PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000",
               PGAPPNAME="report_builder_pilot_export")
    sslmode = parse_qs(source.query).get("sslmode")
    if sslmode:
        env["PGSSLMODE"] = sslmode[0]
    return env


def write_snapshot(folder):
    command = [shutil.which("psql") or "psql", "-X", "-w", "-qAt", "-v", "stream_rows=on",
               "-f", str(HERE / "sales_pilot.sql")]
    controls = None
    with ExitStack() as files:
        writers = {}
        for table, columns in CSV_COLUMNS.items():
            stream = files.enter_context((folder / f"{table}.csv").open("x", encoding="utf-8", newline=""))
            writers[table] = csv.DictWriter(stream, fieldnames=columns, quoting=csv.QUOTE_NOTNULL)
            writers[table].writeheader()
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              text=True, encoding="utf-8", env=warehouse_environment()) as source:
            try:
                for line in source.stdout:
                    table, record = json.loads(line, parse_float=str)
                    if table == "verification":
                        controls = record
                    elif table in writers and set(record) == set(CSV_COLUMNS[table]):
                        writers[table].writerow(record)
                    else:
                        raise ValueError("Unexpected warehouse export shape.")
                if source.wait() or not controls or not controls["passed"]:
                    raise RuntimeError("The warehouse export or its source checks failed.")
            finally:
                if source.poll() is None:
                    source.kill()
                source.stdout.close()
    manifest = {"scope": {"company": "0030", "from": "2026-11-09", "through": "2026-11-15"},
                "verification": controls, "sha256": {t: file_hash(folder / f"{t}.csv") for t in CSV_COLUMNS}}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main():
    home = private_home()
    home.mkdir(parents=True, exist_ok=True)
    destination = home / "csv"
    if not destination.exists():
        # A failed export never becomes the active snapshot. Only this call's
        # temporary parent is cleaned by TemporaryDirectory.
        with tempfile.TemporaryDirectory(dir=home, prefix="export-") as temp:
            staging = Path(temp) / "csv"
            staging.mkdir()
            write_snapshot(staging)
            CsvSnapshot(staging)
            staging.rename(destination)
    snapshot = CsvSnapshot(destination)
    print(json.dumps({"csv_directory": str(destination), "verified_rows": snapshot.counts}))


if __name__ == "__main__":
    main()
