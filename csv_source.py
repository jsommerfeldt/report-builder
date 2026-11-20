"""Read a reconciled CSV snapshot and execute field selections entirely in memory."""

import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path

from model import BY_ID, CSV_COLUMNS, MEASURES, PREVIEW_LIMIT, RELATIONSHIPS, InvalidDefinition, filter_operand, validate_definition


def matches_filter(sources, field, op, expected):
    actual = sources[field.entity][field.column]
    if op == "blank":
        return actual is None or actual == ""
    if actual is None:
        return False
    if field.kind == "text":
        actual = actual.casefold()
    if op == "in":
        return actual in expected
    if op == "contains":
        return expected in actual
    if op == "gte":
        return actual >= expected
    if op == "lte":
        return actual <= expected
    return actual == expected


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def records(folder, table):
    expected = CSV_COLUMNS[table]
    with (folder / f"{table}.csv").open(encoding="utf-8", newline="") as stream:
        reader = csv.reader(stream, quoting=csv.QUOTE_NOTNULL, strict=True)
        if tuple(next(reader, ())) != expected:
            raise ValueError(f"Unexpected columns in {table}.csv.")
        for record in reader:
            if len(record) != len(expected):
                raise ValueError(f"Unexpected row width in {table}.csv.")
            yield dict(zip(expected, record))


class CsvSnapshot:
    def __init__(self, folder: Path):
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"), parse_float=Decimal)
        for table in CSV_COLUMNS:
            if file_hash(folder / f"{table}.csv") != manifest["sha256"][table]:
                raise ValueError(f"Snapshot checksum differs for {table}.csv.")
        control = manifest["verification"]
        if control["passed"] is not True:
            raise ValueError("Source reconciliation failed.")
        self.scope = manifest["scope"]
        self.dimensions = {}
        for entity, (table, _, pk) in RELATIONSHIPS.items():
            rows = {}
            for row in records(folder, table):
                key = row[pk]
                if not key or key in rows:
                    raise ValueError(f"Invalid or repeated key in {table}.csv.")
                rows[key] = row
            self.dimensions[entity] = rows
        facts = list(records(folder, "fact_sales"))
        grain = ("time_key", "company_key", "it_key", "lot_key")
        facts.sort(key=lambda row: tuple(int(row[key]) for key in grain))
        previous = None
        totals = {col: None for col in MEASURES}
        referenced = {entity: set() for entity in RELATIONSHIPS}
        for row in facts:
            key = tuple(row[column] for column in grain)
            if key == previous:
                raise ValueError("Duplicate sales row key.")
            previous = key
            for entity, (_, fk, _) in RELATIONSHIPS.items():
                referenced[entity].add(row[fk])
            for column in MEASURES:
                if row[column] is not None:
                    amount = Decimal(row[column])
                    if not amount.is_finite():
                        raise ValueError("Invalid numeric measure.")
                    row[column] = amount
                    totals[column] = (totals[column] or Decimal(0)) + amount
        for entity, keys in referenced.items():
            if keys != self.dimensions[entity].keys():
                raise ValueError(f"Sales and {entity} keys do not reconcile.")
        baseline = control["before_joins"]
        self.counts = {"sales": len(facts), **{key: len(value) for key, value in self.dimensions.items()}}
        expected = {"sales": baseline["rows"], "customer": control["dimension_rows"]["customers"],
                    "product": control["dimension_rows"]["products"]}
        source_totals = {key: Decimal(str(baseline[key])) if baseline[key] is not None else None for key in MEASURES}
        if self.counts != expected or totals != source_totals:
            raise ValueError("CSV row counts or exact measure totals differ from the source.")
        self.facts = facts

    def choices(self, payload):
        if not isinstance(payload, dict):
            raise InvalidDefinition("Invalid value search.")
        key, query, offset = payload.get("field"), payload.get("query", ""), payload.get("offset", 0)
        if (not isinstance(key, str) or key not in BY_ID or not isinstance(query, str)
                or len(query) > 160 or type(offset) is not int or offset < 0):
            raise InvalidDefinition("Invalid value search.")
        field = BY_ID[key]
        source = self.facts if field.entity == "sales" else self.dimensions[field.entity].values()
        distinct = {row[field.column] for row in source}
        distinct.discard(None)
        distinct.discard("")
        values = [format(v, "f") if isinstance(v, Decimal) else v for v in sorted(distinct)]
        term = query.strip().casefold()
        matches = [v for v in values if term in v.casefold()]
        return {"values": matches[offset:offset+50], "total": len(matches)}

    def preview(self, raw, *, offset=0):
        definition = validate_definition(raw)
        fields = [BY_ID[key] for key in definition["fields"]]
        entities = {field.entity for field in fields if field.entity in RELATIONSHIPS}
        active = []
        for rule in definition.get("filters", []):
            if rule["enabled"]:
                field = BY_ID[rule["field"]]
                if rule["op"] == "in":
                    operand = frozenset(filter_operand(field, item) for item in rule["value"])
                else:
                    operand = None if rule["op"] == "blank" else filter_operand(field, rule["value"])
                active.append((field, rule["op"], operand))
                if field.entity in RELATIONSHIPS:
                    entities.add(field.entity)
        dimension_pos = [i for i, field in enumerate(fields) if not field.measure]
        measure_pos = [i for i, field in enumerate(fields) if field.measure]
        detail = definition["mode"] == "detail"
        rows = []
        groups = {}
        matched = 0
        order = [spec for spec in definition.get("order", []) if spec.get("enabled", True)]
        candidates = self.facts[offset:offset + PREVIEW_LIMIT] if detail and not active and not order else self.facts
        for fact in candidates:
            sources = {"sales": fact}
            for entity in entities:
                fk = RELATIONSHIPS[entity][1]
                sources[entity] = self.dimensions[entity][fact[fk]]
            if any(not matches_filter(sources, *rule) for rule in active):
                continue
            matched += 1
            if detail and not order and (len(rows) == PREVIEW_LIMIT or (active and matched <= offset)):
                continue
            values = [sources[field.entity][field.column] for field in fields]
            if detail:
                rows.append(values)
                continue
            key = tuple(values[index] for index in dimension_pos)
            if key not in groups:
                groups[key] = values
            else:
                target = groups[key]
                for index in measure_pos:
                    if values[index] is not None:
                        target[index] = (target[index] or Decimal(0)) + values[index]
        if detail:
            total = matched if active else len(self.facts)
        else:
            # Groups keep the first matching fact's position until an enabled field sorts them.
            rows = list(groups.values())
            total = len(groups)
        # Stable sorts from the last priority to the first. NULL stays last in both directions.
        for spec in reversed(order):
            pos = definition["fields"].index(spec["field"])
            present = [row for row in rows if row[pos] is not None]
            present.sort(key=lambda row: row[pos], reverse=spec["direction"] == "desc")
            rows = present + [row for row in rows if row[pos] is None]
        if not detail or order:
            rows = rows[offset:offset + PREVIEW_LIMIT]
        return {"fields": definition["fields"], "rows": [
            [str(value) if isinstance(value, Decimal) else value for value in row] for row in rows
        ], "total": total, "limit": PREVIEW_LIMIT, "sourceRows": len(self.facts)}
