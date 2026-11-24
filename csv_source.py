"""Read a reconciled CSV snapshot and execute field selections entirely in memory."""

import csv
import hashlib
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from model import (BY_ID, COMPANIES, CSV_COLUMNS, CSV_COLUMNS_WITH_DATETIME, CSV_COLUMNS_WITH_WAREHOUSES, FIELDS,
                   LEGACY_COLUMNS, LEGACY_COMPANY, MEASURES, PREVIEW_LIMIT, RELATIONSHIPS, InvalidDefinition,
                   filter_operand, relative_range, validate_definition)


def matches_filter(sources, field, op, expected, case_sensitive):
    actual = sources[field.entity][field.column]
    if op == "blank":
        return actual is None or actual == ""
    if actual is None:
        return False
    if op == "relative":
        start, end = expected
        return start <= actual < end
    if field.kind == "text" and not case_sensitive:
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


def cell_value(value):
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    return str(value) if isinstance(value, (Decimal, int)) else value


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def control_amount(value):
    return None if value is None else Decimal(str(value))


def records(folder, table, expected):
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
        self.version = manifest.get("snapshot_version", 1)
        if self.version not in (1, 2):
            raise ValueError("Unsupported snapshot version.")
        self.has_dispatch_time = manifest.get("trip_datetime") is True
        self.has_warehouses = manifest.get("warehouses") is True
        if self.has_dispatch_time and self.version != 2:
            raise ValueError("Dispatch timestamps require an expanded snapshot.")
        if self.has_warehouses and not self.has_dispatch_time:
            raise ValueError("Warehouse fields require the expanded snapshot with dispatch timestamps.")
        columns = CSV_COLUMNS if self.version == 2 else LEGACY_COLUMNS
        if self.has_dispatch_time:
            columns = CSV_COLUMNS_WITH_WAREHOUSES if self.has_warehouses else CSV_COLUMNS_WITH_DATETIME
        self.blank_trip = dict.fromkeys(columns.get("dim_trips", ()))
        relationships = {entity: spec for entity, spec in RELATIONSHIPS.items() if spec[0] in columns}
        fields_by_entity = {"sales": columns["fact_sales"],
                            **{entity: columns[spec[0]] for entity, spec in relationships.items()}}
        self.fields = [field for field in FIELDS if field.column in fields_by_entity.get(field.entity, ())]
        self.field_ids = {field.id for field in self.fields}
        for table in columns:
            if file_hash(folder / f"{table}.csv") != manifest["sha256"][table]:
                raise ValueError(f"Snapshot checksum differs for {table}.csv.")
        control = manifest["verification"]
        self.verified_summary_groups = control.get("verified_summary_groups", 0)
        if control["passed"] is not True:
            raise ValueError("Source reconciliation failed.")
        self.scope = manifest["scope"]
        if self.version == 2 and self.scope.get("companies") != list(COMPANIES):
            raise ValueError("Unexpected expanded company scope.")
        self.dimensions = {}
        for entity, (table, _, pk) in relationships.items():
            rows = {}
            for row in records(folder, table, columns[table]):
                key = row[pk]
                if not key or key in rows:
                    raise ValueError(f"Invalid or repeated key in {table}.csv.")
                if entity == "trip" and self.has_dispatch_time:
                    timestamp = row["dispatchdatetime"]
                    if timestamp is not None:
                        timestamp = filter_operand(BY_ID["trip.dispatchdatetime"], timestamp)
                        if timestamp.date().isoformat() != row["dispatchdate"]:
                            raise ValueError("A dispatch timestamp does not match its dispatch date.")
                        row["dispatchdatetime"] = timestamp
                    elif row["dispatchdate"] is not None:
                        raise ValueError("Missing timestamp for a trip with a dispatch date.")
                rows[key] = row
            self.dimensions[entity] = rows
        facts = list(records(folder, "fact_sales", columns["fact_sales"]))
        grain = ("time_key", "company_key", "it_key", "lot_key")
        facts.sort(key=lambda row: tuple(int(row[key]) for key in grain))
        previous = None
        totals = {col: None for col in MEASURES}
        referenced = {entity: set() for entity in relationships}
        company_checks = {company: {"rows": 0, **dict.fromkeys(MEASURES)} for company in COMPANIES}
        for row in facts:
            key = tuple(row[column] for column in grain)
            if key == previous:
                raise ValueError("Duplicate sales row key.")
            previous = key
            for entity, (_, fk, _) in relationships.items():
                if entity != "trip" or row[fk] is not None:
                    referenced[entity].add(row[fk])
            check = None
            if self.version == 2:
                check = company_checks.get(row["company"])
                if check is None:
                    raise ValueError("Unexpected sales company.")
                check["rows"] += 1
            for column in MEASURES:
                if row[column] is not None:
                    amount = Decimal(row[column])
                    if not amount.is_finite():
                        raise ValueError("Invalid numeric measure.")
                    row[column] = amount
                    totals[column] = (totals[column] or Decimal(0)) + amount
                    if check is not None:
                        check[column] = (check[column] or Decimal(0)) + amount
        for entity, keys in referenced.items():
            if keys != self.dimensions[entity].keys():
                raise ValueError(f"Sales and {entity} keys do not reconcile.")
        baseline = control["before_joins"]
        self.counts = {"sales": len(facts), **{key: len(value) for key, value in self.dimensions.items()}}
        expected = {"sales": baseline["rows"], "customer": control["dimension_rows"]["customers"],
                    "product": control["dimension_rows"]["products"]}
        if self.version == 2:
            expected["trip"] = control["dimension_rows"]["trips"]
            if self.has_warehouses:
                expected["warehouse"] = control["dimension_rows"]["warehouses"]
            for company, check in company_checks.items():
                source = control["by_company"][company]
                if not check["rows"] or check["rows"] != source["rows"] or any(
                    check[key] != control_amount(source[key]) for key in MEASURES
                ):
                    raise ValueError(f"CSV rows or exact totals differ for company {company}.")
        if self.counts != expected or any(totals[key] != control_amount(baseline[key]) for key in MEASURES):
            raise ValueError("CSV row counts or exact measure totals differ from the source.")
        self.facts = facts
        self.legacy_facts = [row for row in facts if row["company"] == LEGACY_COMPANY] if self.version == 2 else None

    def scoped_facts(self, version):
        if type(version) is not int or not 1 <= version <= self.version:
            raise InvalidDefinition("This report requires the expanded sales snapshot.")
        return self.legacy_facts if version == 1 and self.legacy_facts is not None else self.facts

    def definition(self, raw):
        definition = validate_definition(raw)
        self.scoped_facts(definition["version"])
        ids = set(definition["fields"]) | {rule["field"] for rule in definition.get("filters", ())}
        if not ids <= self.field_ids:
            raise InvalidDefinition("A selected field requires the expanded sales snapshot.")
        return definition

    def choices(self, payload):
        if not isinstance(payload, dict):
            raise InvalidDefinition("Invalid value search.")
        key, query, offset = payload.get("field"), payload.get("query", ""), payload.get("offset", 0)
        if (not isinstance(key, str) or key not in self.field_ids or not isinstance(query, str)
                or len(query) > 160 or type(offset) is not int or offset < 0):
            raise InvalidDefinition("Invalid value search.")
        field = BY_ID[key]
        facts = self.scoped_facts(payload.get("version", self.version))
        if field.entity == "sales":
            source = facts
        elif facts is self.legacy_facts:
            _, fk, _ = RELATIONSHIPS[field.entity]
            dimension = self.dimensions[field.entity]
            source = (dimension[key] for key in {row[fk] for row in facts} if key is not None)
        else:
            source = self.dimensions[field.entity].values()
        distinct = {row[field.column] for row in source}
        distinct.discard(None)
        distinct.discard("")
        values = [format(v, "f") if isinstance(v, Decimal) else cell_value(v) for v in sorted(distinct)]
        term = query.strip().casefold()
        matches = [v for v in values if term in v.casefold()]
        return {"values": matches[offset:offset+50], "total": len(matches)}

    def preview(self, raw, *, offset=0, limit=PREVIEW_LIMIT, now=None):
        definition = self.definition(raw)
        facts = self.scoped_facts(definition["version"])
        detail = definition["mode"] == "detail"
        output_ids = definition["fields"]
        if not detail and "groupBy" in definition:
            group_by = set(definition["groupBy"])
            output_ids = [key for key in output_ids if key in group_by or BY_ID[key].measure]
        fields = [BY_ID[key] for key in output_ids]
        entities = {field.entity for field in fields if field.entity in RELATIONSHIPS}
        active = []
        now = datetime.now() if now is None else now
        for rule in definition.get("filters", []):
            if rule["enabled"]:
                field = BY_ID[rule["field"]]
                op, value = rule["op"], rule["value"]
                case_sensitive = rule.get("caseSensitive", False)
                if op == "in":
                    operand = frozenset(filter_operand(field, item, case_sensitive=case_sensitive) for item in value)
                elif op == "relative":
                    operand = relative_range(field, value, now)
                else:
                    operand = None if op == "blank" else filter_operand(field, value, case_sensitive=case_sensitive)
                active.append((field, op, operand, case_sensitive))
                if field.entity in RELATIONSHIPS:
                    entities.add(field.entity)
        dimension_pos = [i for i, field in enumerate(fields) if not field.measure]
        aggregations = {} if detail else definition.get("aggregations", {})
        measures = [(i, aggregations.get(field.id, "sum")) for i, field in enumerate(fields) if field.measure]
        count_positions = [i for i, method in measures if method == "count"]
        average_positions = [i for i, method in measures if method == "avg"]
        rows = []
        groups = {}
        matched = 0
        order = [spec for spec in definition.get("order", []) if spec.get("enabled", True) and spec["field"] in output_ids]
        end = None if limit is None else offset + limit
        candidates = facts[offset:end] if detail and not active and not order else facts
        for fact in candidates:
            sources = {"sales": fact}
            for entity in entities:
                fk = RELATIONSHIPS[entity][1]
                sources[entity] = self.blank_trip if entity == "trip" and fact[fk] is None else self.dimensions[entity][fact[fk]]
            if any(not matches_filter(sources, *rule) for rule in active):
                continue
            matched += 1
            if detail and not order and (len(rows) == limit or (active and matched <= offset)):
                continue
            values = [sources[field.entity][field.column] for field in fields]
            if detail:
                rows.append(values)
                continue
            key = tuple(values[index] for index in dimension_pos)
            if key not in groups:
                for index in count_positions:
                    values[index] = int(values[index] is not None)
                groups[key] = values, {index: int(values[index] is not None) for index in average_positions}
                continue
            target, average_counts = groups[key]
            for index, method in measures:
                value = values[index]
                if value is None:
                    continue
                if method == "count":
                    target[index] += 1
                    continue
                if method == "avg":
                    average_counts[index] += 1
                if method in ("sum", "avg"):
                    target[index] = (target[index] or Decimal(0)) + value
                elif target[index] is None:
                    target[index] = value
                elif method == "min":
                    target[index] = min(target[index], value)
                else:
                    target[index] = max(target[index], value)
        if detail:
            total = matched if active else len(facts)
        else:
            # Groups keep the first matching fact's position until an enabled field sorts them.
            for values, average_counts in groups.values():
                for index, count in average_counts.items():
                    if count:
                        values[index] /= count
                rows.append(values)
            total = len(groups)
        # Stable sorts from the last priority to the first. NULL stays last in both directions.
        for spec in reversed(order):
            pos = output_ids.index(spec["field"])
            present = [row for row in rows if row[pos] is not None]
            present.sort(key=lambda row: row[pos], reverse=spec["direction"] == "desc")
            rows = present + [row for row in rows if row[pos] is None]
        if not detail or order:
            rows = rows[offset:end]
        return {"fields": output_ids, "rows": [
            [cell_value(value) for value in row] for row in rows
        ], "total": total, "limit": limit, "sourceRows": len(facts),
            **({"aggregations": aggregations} if aggregations else {})}
