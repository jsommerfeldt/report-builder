"""Persist versioned definitions as per-user JSON files, without report results."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import UUID, uuid4

from model import InvalidDefinition, validate_definition


class RevisionConflict(Exception):
    pass


class LibraryConflict(Exception):
    pass


def checked_name(value, kind):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 80 or not value.strip().isprintable():
        raise InvalidDefinition(f"Enter a {kind} name of 1 to 80 printable characters.")
    return value.strip()


def check_revision(record, revision):
    if type(revision) is not int or revision != record["revision"]:
        raise RevisionConflict()


def write_json(path, value):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def info(record):
    return {k: record[k] for k in ("id", "name", "revision", "updated", "folderId", "deletedAt") if k in record}


class NameConflict(Exception):
    def __init__(self, target):
        self.target = {key: target[key] for key in ("id", "name", "revision")}


class ReportStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.folder_file = self.directory / "library" / "folders.json"
        self.lock = RLock()

    def _read(self, report_id):
        try:
            if str(UUID(report_id)) != report_id:
                raise ValueError()
        except (ValueError, TypeError):
            raise FileNotFoundError() from None
        return json.loads((self.directory / f"{report_id}.json").read_text(encoding="utf-8"))

    def get(self, report_id):
        record = self._read(report_id)
        if record.get("deletedAt"):
            raise FileNotFoundError()
        return record

    def _entries(self):
        items = (info(self._read(path.stem)) for path in self.directory.glob("*.json"))
        return sorted(items, key=lambda item: item["updated"], reverse=True)

    def list(self):
        with self.lock:
            return [r for r in self._entries() if not r.get("deletedAt")]

    def _folders(self):
        try:
            return json.loads(self.folder_file.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}

    def library(self):
        with self.lock:
            return {"folders": list(self._folders().values()), "reports": self._entries()}

    @staticmethod
    def _destination(folders, folder_id):
        if folder_id is not None and (not isinstance(folder_id, str) or folder_id not in folders):
            raise LibraryConflict("That folder is no longer available. Choose another location.")

    def change_folder(self, action, payload, folder_id=None):
        expected = {"name", "parentId"} if action == "create" else {"revision"}
        if action == "update":
            expected |= {"name", "parentId"}
        if not isinstance(payload, dict) or set(payload) != expected:
            raise InvalidDefinition("Invalid folder request.")
        with self.lock:
            folders = self._folders()
            current = None
            if folder_id is not None:
                if folder_id not in folders:
                    raise FileNotFoundError()
                current = folders[folder_id]
                check_revision(current, payload["revision"])
            if action == "delete":
                parent = current["parentId"]
                siblings = {f["name"].casefold() for f in folders.values()
                            if f["parentId"] == parent and f["id"] != folder_id}
                children = [f for f in folders.values() if f["parentId"] == folder_id]
                for child in children:
                    if child["name"].casefold() in siblings:
                        raise LibraryConflict(f'Rename the subfolder "{child["name"]}" first. A folder with that name exists at the destination.')
                    child.update(parentId=parent, revision=child["revision"] + 1)
                for entry in self._entries():
                    if entry.get("folderId") == folder_id:
                        record = self._read(entry["id"])
                        record.update(folderId=parent, revision=record["revision"] + 1)
                        write_json(self.directory / (entry["id"] + ".json"), record)
                del folders[folder_id]
                result = {"ok": True}
            else:
                name = checked_name(payload["name"], "folder")
                parent = payload["parentId"]
                self._destination(folders, parent)
                ancestor = parent
                while ancestor is not None:
                    if ancestor == folder_id:
                        raise InvalidDefinition("A folder cannot be moved inside itself or its subfolders.")
                    ancestor = folders[ancestor]["parentId"]
                if any(f["id"] != folder_id and f["parentId"] == parent and f["name"].casefold() == name.casefold()
                       for f in folders.values()):
                    raise LibraryConflict("A folder with that name already exists here.")
                result = {"id": folder_id or str(uuid4()), "name": name, "parentId": parent,
                          "revision": current["revision"] + 1 if current else 1}
                folders[result["id"]] = result
            self.folder_file.parent.mkdir(exist_ok=True)
            write_json(self.folder_file, folders)
            return result

    def change_report(self, action, report_id, payload):
        expected = {"revision", "folderId"} if action == "move" else {"revision"}
        if not isinstance(payload, dict) or set(payload) != expected:
            raise InvalidDefinition("Invalid dataset management request.")
        with self.lock:
            record = self._read(report_id)
            check_revision(record, payload["revision"])
            if bool(record.get("deletedAt")) != (action == "restore"):
                raise LibraryConflict("The dataset has changed. Refresh the library.")
            now = datetime.now(timezone.utc).isoformat()
            if action == "move":
                self._destination(self._folders(), payload["folderId"])
                record["folderId"] = payload["folderId"]
            elif action == "trash":
                record["deletedAt"] = now
            else:
                del record["deletedAt"]
                if record.get("folderId") not in self._folders():
                    record["folderId"] = None
                names = {r["name"].casefold() for r in self.list()}
                base = record["name"]
                index = 1
                while record["name"].casefold() in names:
                    suffix = " (restored)" if index == 1 else f" (restored {index})"
                    record["name"] = base[:80-len(suffix)] + suffix
                    index += 1
            record.update(revision=record["revision"] + 1, updated=now)
            write_json(self.directory / f"{report_id}.json", record)
            return info(record)

    def delete_trashed_report(self, report_id, payload):
        if not isinstance(payload, dict) or set(payload) != {"revision"}:
            raise InvalidDefinition("Invalid dataset deletion request.")
        with self.lock:
            record = self._read(report_id)
            check_revision(record, payload["revision"])
            if not record.get("deletedAt"):
                raise LibraryConflict("Only datasets in Trash can be deleted permanently.")
            (self.directory / f"{report_id}.json").unlink()

    def save(self, payload, report_id=None, *, validate=validate_definition):
        expected = {"name", "definition", "revision"} if report_id else {"name", "definition"}
        optional = {"overwrite"} if report_id else {"overwrite", "folderId"}
        if not isinstance(payload, dict) or set(payload) - optional != expected:
            raise InvalidDefinition("Invalid save request.")
        name = checked_name(payload["name"], "dataset")
        definition = validate(payload["definition"])
        confirmation = payload.get("overwrite")
        if "overwrite" in payload and (not isinstance(confirmation, dict)
                or set(confirmation) != {"id", "revision"} or type(confirmation["revision"]) is not int):
            raise InvalidDefinition("Invalid overwrite confirmation.")
        with self.lock:
            revision = 1
            existing = None
            if report_id:
                existing = self.get(report_id)
                check_revision(existing, payload["revision"])
                revision = existing["revision"] + 1
            folder_id = existing.get("folderId") if existing else payload.get("folderId")
            name_key = name.casefold()
            if existing is None or existing["name"].strip().casefold() != name_key:
                matches = [r for r in self.list() if r["name"].strip().casefold() == name_key]
                if len(matches) > 1:
                    raise InvalidDefinition("Several saved datasets have that name. Pick a unique name or open the intended dataset.")
                if matches:
                    target = matches[0]
                    if confirmation is None:
                        raise NameConflict(target)
                    if confirmation != {"id": target["id"], "revision": target["revision"]}:
                        raise RevisionConflict()
                    report_id, revision = target["id"], target["revision"] + 1
                    folder_id = target.get("folderId")
                elif confirmation is not None:
                    raise RevisionConflict()
            elif confirmation is not None:
                raise RevisionConflict()
            if report_id is None:
                report_id = str(uuid4())
            self._destination(self._folders(), folder_id)
            record = {"id": report_id, "name": name, "definition": definition, "folderId": folder_id,
                      "revision": revision, "updated": datetime.now(timezone.utc).isoformat()}
            write_json(self.directory / f"{report_id}.json", record)
        return record
