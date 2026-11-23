"""Export one read-only warehouse snapshot to the user's private pilot directory."""

import argparse
import csv
import json
import os
import shutil
import subprocess
import tempfile
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from csv_source import CsvSnapshot, control_amount, file_hash
from local_paths import DATETIME_SNAPSHOT, EXPANDED_SNAPSHOT, HERE, LEGACY_SNAPSHOT, SNAPSHOT_POINTER, private_home
from model import COMPANIES, CSV_COLUMNS_WITH_DATETIME, MEASURES

SUMMARY_FIELDS = ("sales.company", "product.commoditydescription", "customer.customerregiondescription",
                  "trip.tripnumber", *(f"sales.{measure}" for measure in MEASURES))


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
    source_summary = {}
    with ExitStack() as files:
        writers = {}
        for table, columns in CSV_COLUMNS_WITH_DATETIME.items():
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
                    elif table == "summary":
                        key = tuple(record[field.split(".", 1)[1]] for field in SUMMARY_FIELDS[:4])
                        if key in source_summary:
                            raise ValueError("Duplicate direct SQL summary group.")
                        source_summary[key] = tuple(control_amount(record[measure]) for measure in MEASURES)
                    elif table in writers and set(record) == set(CSV_COLUMNS_WITH_DATETIME[table]):
                        writers[table].writerow(record)
                    else:
                        raise ValueError("Unexpected warehouse export shape.")
                if source.wait() or not controls or not controls["passed"]:
                    raise RuntimeError("The warehouse export or its source checks failed.")
            finally:
                if source.poll() is None:
                    source.kill()
                source.stdout.close()
    manifest = {"snapshot_version": 2, "trip_datetime": True,
                "scope": {"companies": list(COMPANIES), "from": "2026-11-09", "through": "2026-11-15"},
                "verification": controls, "sha256": {t: file_hash(folder / f"{t}.csv") for t in CSV_COLUMNS_WITH_DATETIME}}
    manifest_file = folder / "manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    snapshot = CsvSnapshot(folder)
    definition = {"version": 2, "source": "sales", "mode": "summary", "fields": list(SUMMARY_FIELDS)}
    preview = snapshot.preview(definition, limit=None)
    csv_summary = {tuple(row[:4]): tuple(map(control_amount, row[4:])) for row in preview["rows"]}
    if not source_summary or csv_summary != source_summary:
        raise ValueError("The grouped report differs from direct SQL.")
    controls["verified_summary_groups"] = len(source_summary)
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def select_snapshot(home, name):
    with tempfile.NamedTemporaryFile(mode="w", encoding="ascii", dir=home,
                                     prefix="snapshot-pointer-", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(name + "\n")
    try:
        temporary.replace(home / SNAPSHOT_POINTER)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", nargs="?", default="stage", choices=["stage", "activate", "rollback"])
    action = parser.parse_args().action
    home = private_home()
    home.mkdir(parents=True, exist_ok=True)
    destination = home / (LEGACY_SNAPSHOT if action == "rollback" else DATETIME_SNAPSHOT)
    if action == "activate" and not destination.exists():
        destination = home / EXPANDED_SNAPSHOT
    if action == "stage" and not destination.exists():
        # A failed export never becomes the active snapshot. Only this call's
        # temporary parent is cleaned by TemporaryDirectory.
        with tempfile.TemporaryDirectory(dir=home, prefix="export-") as temp:
            staging = Path(temp) / "csv"
            staging.mkdir()
            write_snapshot(staging)
            try:
                staging.rename(destination)
            except FileExistsError:
                pass  # A concurrent stage already published the immutable version.
    snapshot = CsvSnapshot(destination)
    if snapshot.version != (1 if action == "rollback" else 2):
        raise ValueError("Snapshot version does not match its destination.")
    if snapshot.has_dispatch_time != (destination.name == DATETIME_SNAPSHOT):
        raise ValueError("Snapshot columns do not match its destination.")
    if snapshot.version == 2 and not snapshot.verified_summary_groups:
        raise ValueError("The staged snapshot lacks direct SQL summary verification.")
    if action != "stage":
        select_snapshot(home, destination.name)
    print(json.dumps({"action": action, "csv_directory": str(destination), "verified_rows": snapshot.counts}))


if __name__ == "__main__":
    main()
