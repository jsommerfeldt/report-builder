"""Report definitions and the pilot's explicit sales relationship catalog."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import re


LEGACY_COLUMNS = {
    "fact_sales": ("time_key", "company_key", "it_key", "lot_key", "reporting_date",
                   "customer_key", "product_key", "sales", "creditsales", "shipquantitycseq"),
    "dim_customers": ("customer_key", "customercompany", "customer", "customername", "shippingcity", "shippingstate"),
    "dim_products": ("product_key", "productcompany", "productnumber", "productdesc", "packaging"),
}
CSV_COLUMNS = {
    "fact_sales": (*LEGACY_COLUMNS["fact_sales"], "company", "trip_key"),
    "dim_customers": (*LEGACY_COLUMNS["dim_customers"], "customerregiondescription", "shippingzip", "salesparentcustomername"),
    "dim_products": (*LEGACY_COLUMNS["dim_products"], "departmentdescription", "commoditydescription", "classdescription"),
    "dim_trips": ("trip_key", "tripnumber", "tripdescription", "dispatchdate"),
}
CSV_COLUMNS_WITH_DATETIME = {**CSV_COLUMNS, "dim_trips": (*CSV_COLUMNS["dim_trips"], "dispatchdatetime")}
CSV_COLUMNS_WITH_WAREHOUSES = {
    **CSV_COLUMNS_WITH_DATETIME,
    "fact_sales": (*CSV_COLUMNS["fact_sales"], "warehouse_key"),
    "dim_warehouses": ("warehouse_key", "warehousecompany", "warehouse", "warehousedesc"),
}
COMPANIES = ("0001", "0030")
LEGACY_COMPANY = "0030"
ENTITIES = {"sales": "Sales", "customer": "Customers", "product": "Products", "trip": "Trips", "warehouse": "Warehouses"}
# entity -> (CSV relation, fact foreign key, dimension primary key)
RELATIONSHIPS = {
    "customer": ("dim_customers", "customer_key", "customer_key"),
    "product": ("dim_products", "product_key", "product_key"),
    "trip": ("dim_trips", "trip_key", "trip_key"),
    "warehouse": ("dim_warehouses", "warehouse_key", "warehouse_key"),
}


@dataclass(frozen=True)
class Field:
    entity: str
    column: str
    label: str
    kind: str = "text"

    @property
    def id(self):
        return f"{self.entity}.{self.column}"

    @property
    def measure(self):
        return self.kind in ("currency", "quantity")


FIELDS = (
    Field("sales", "company", "Sales company"),
    Field("sales", "reporting_date", "Reporting date", "date"),
    Field("sales", "sales", "Sales", "currency"),
    Field("sales", "creditsales", "Credit sales", "currency"),
    Field("sales", "shipquantitycseq", "Shipped case equivalents", "quantity"),
    Field("customer", "customer", "Customer number"),
    Field("customer", "customername", "Customer name"),
    Field("customer", "shippingcity", "Shipping city"),
    Field("customer", "shippingstate", "Shipping state"),
    Field("customer", "customercompany", "Customer company"),
    Field("customer", "customerregiondescription", "Customer region"),
    Field("customer", "shippingzip", "Shipping ZIP"),
    Field("customer", "salesparentcustomername", "Sales parent customer"),
    Field("product", "productnumber", "Product number"),
    Field("product", "productdesc", "Product description"),
    Field("product", "packaging", "Packaging"),
    Field("product", "productcompany", "Product company"),
    Field("product", "departmentdescription", "Department"),
    Field("product", "commoditydescription", "Commodity"),
    Field("product", "classdescription", "Class"),
    Field("trip", "tripnumber", "Trip number"),
    Field("trip", "tripdescription", "Trip description"),
    Field("trip", "dispatchdate", "Dispatch date", "date"),
    Field("trip", "dispatchdatetime", "Dispatch Date and Time", "datetime"),
    Field("warehouse", "warehouse", "Warehouse Code"),
    Field("warehouse", "warehousedesc", "Warehouse Name"),
    Field("warehouse", "warehousecompany", "Warehouse Company"),
)
BY_ID = {field.id: field for field in FIELDS}
MEASURES = tuple(field.column for field in FIELDS if field.measure)
NUMERIC_AGGREGATIONS = ("sum", "avg", "min", "max", "count", "none")
DIMENSION_AGGREGATIONS = ("first", "last", "count", "unique")
PREVIEW_LIMIT = 50
STARTER = {"version": 1, "source": "sales", "mode": "summary",
           "fields": ["customer.shippingstate", "product.productnumber", "sales.sales", "sales.shipquantitycseq"],
           "order": [{"field": "sales.sales", "direction": "desc", "priority": 1}]}


class InvalidDefinition(ValueError):
    pass


def filter_operand(field, value, *, case_sensitive=False):
    if field.measure:
        if not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)", value):
            raise InvalidDefinition("Enter a decimal number for " + field.label + ".")
        return Decimal(value)
    if field.kind == "date":
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise InvalidDefinition("Enter a valid date for " + field.label + ".") from None
    if field.kind == "datetime":
        try:
            if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,6})?)?", value):
                raise ValueError
            return datetime.fromisoformat(value)
        except ValueError:
            raise InvalidDefinition("Enter a valid local date and time for " + field.label + ".") from None
    return value if case_sensitive else value.casefold()


def relative_range(field, value, now):
    amount, unit, direction = value["amount"], value["unit"], value["direction"]
    if unit == "hours":
        span = timedelta(hours=amount)
        return (now - span, now) if direction == "last" else (now, now + span)
    days = amount * (7 if unit == "weeks" else 1)
    today = now.date()
    start = today - timedelta(days=days-1) if direction == "last" else today
    end = start + timedelta(days=days)
    if field.kind == "datetime":
        return datetime.combine(start, time.min), datetime.combine(end, time.min)
    return start.isoformat(), end.isoformat()


def validate_filters(rules):
    if not isinstance(rules, list) or len(rules) > 32:
        raise InvalidDefinition("A report supports up to 32 filters.")
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) - {"caseSensitive"} != {"field", "op", "value", "enabled"}:
            raise InvalidDefinition("Invalid filter format.")
        key, op, value = rule["field"], rule["op"], rule["value"]
        if not isinstance(key, str) or key not in BY_ID or type(rule["enabled"]) is not bool:
            raise InvalidDefinition("Choose an available filter field.")
        field = BY_ID[key]
        if "caseSensitive" in rule and (type(rule["caseSensitive"]) is not bool or
                field.kind != "text" or op not in ("in", "eq", "contains")):
            raise InvalidDefinition("Match case is available only for text comparisons.")
        if op == "relative":
            units = {"date": ("days", "weeks"), "datetime": ("hours", "days", "weeks")}.get(field.kind, ())
            if (not isinstance(value, dict) or set(value) != {"amount", "unit", "direction"}
                    or type(value["amount"]) is not int or not 1 <= value["amount"] <= 365
                    or value["unit"] not in units or value["direction"] not in ("last", "next")):
                raise InvalidDefinition("Choose a relative period between 1 and 365 for a date or date and time field.")
            continue
        if op == "in":
            if not isinstance(value, list) or not 1 <= len(value) <= 256:
                raise InvalidDefinition("Select between 1 and 256 filter values.")
            for item in value:
                if not isinstance(item, str) or not item.strip() or len(item) > 160:
                    raise InvalidDefinition("Each filter value must be 1 to 160 characters.")
                filter_operand(field, item)
            continue
        allowed = ("eq", "contains", "blank") if field.kind == "text" else ("eq", "gte", "lte", "blank")
        if op not in allowed or not isinstance(value, str) or len(value) > 160:
            raise InvalidDefinition("Unsupported filter condition.")
        if op != "blank":
            if not value.strip():
                raise InvalidDefinition("Enter a filter value.")
            filter_operand(field, value)
    return rules


def summary_fields(definition):
    group_by = definition.get("groupBy")
    aggregations = definition.get("aggregations", {})
    return [key for key in definition["fields"] if
            (aggregations.get(key) != "none" if BY_ID[key].measure
             else key in aggregations or group_by is None or key in group_by)]


def validate_definition(value):
    if (not isinstance(value, dict)
            or set(value) - {"filters", "order", "groupBy", "aggregations"} != {"version", "source", "mode", "fields"}):
        raise InvalidDefinition("The report definition has an unsupported format.")
    if type(value["version"]) is not int or value["version"] not in (1, 2) or value["source"] != "sales":
        raise InvalidDefinition("The report source or definition version is unavailable.")
    if value["mode"] not in ("detail", "summary"):
        raise InvalidDefinition("Choose a detail or summary preview.")
    ids = value["fields"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= len(FIELDS):
        raise InvalidDefinition("Choose at least one available field.")
    if any(not isinstance(key, str) or key not in BY_ID for key in ids) or len(set(ids)) != len(ids):
        raise InvalidDefinition("Each selected field must be available and appear once.")
    result = {"version": value["version"], "source": "sales", "mode": value["mode"], "fields": list(ids)}
    if "filters" in value:
        result["filters"] = validate_filters(value["filters"])
    if "groupBy" in value:
        group_by = value["groupBy"]
        dimensions = {key for key in ids if not BY_ID[key].measure}
        if (not isinstance(group_by, list) or len(group_by) > len(dimensions)
                or any(not isinstance(key, str) or key not in dimensions for key in group_by)
                or len(set(group_by)) != len(group_by)):
            raise InvalidDefinition("Group by selected non-measure columns, each at most once.")
        result["groupBy"] = list(group_by)
    if "aggregations" in value:
        aggregations = value["aggregations"]
        if not isinstance(aggregations, dict) or any(
            key not in ids or method not in (NUMERIC_AGGREGATIONS if BY_ID[key].measure else DIMENSION_AGGREGATIONS)
            for key, method in aggregations.items()
        ):
            raise InvalidDefinition("Choose a supported aggregation for each selected column.")
        if aggregations:
            result["aggregations"] = dict(aggregations)
    if result["mode"] == "summary" and not summary_fields(result):
        raise InvalidDefinition("Choose a column to group by or a numeric column to aggregate.")
    if "order" in value:
        order = value["order"]
        if not isinstance(order, list) or len(order) > len(ids):
            raise InvalidDefinition("Invalid output order.")
        by_field = {}
        for item in order:
            if (not isinstance(item, dict) or set(item) - {"enabled", "priority"} != {"field", "direction"}
                    or item["field"] not in ids or item["field"] in by_field
                    or type(item.get("enabled", True)) is not bool
                    or item["direction"] not in ("asc", "desc")):
                raise InvalidDefinition("Order by each output field at most once.")
            by_field[item["field"]] = item
        # Older definitions used column order for precedence. Assign ranks on read.
        legacy_sequence = [by_field[key] for key in ids if key in by_field]
        active = [item for item in legacy_sequence if item.get("enabled", True)]
        inactive = [item for item in legacy_sequence if not item.get("enabled", True)]
        if any("priority" in item for item in inactive):
            raise InvalidDefinition("Only enabled sort fields can have a priority.")
        if any("priority" in item for item in active):
            ranks = [item.get("priority") for item in active]
            if any(type(rank) is not int for rank in ranks) or sorted(ranks) != list(range(1, len(active)+1)):
                raise InvalidDefinition("Sort priorities must run from 1 to the number of enabled fields, without repeats.")
            active.sort(key=lambda item: item["priority"])
        result["order"] = [{**item, "priority": rank} for rank, item in enumerate(active, 1)] + inactive
    return result
