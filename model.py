"""Report definitions and the pilot's explicit sales relationship catalog."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import re


CSV_COLUMNS = {
    "fact_sales": ("time_key", "company_key", "it_key", "lot_key", "reporting_date",
                   "customer_key", "product_key", "sales", "creditsales", "shipquantitycseq"),
    "dim_customers": ("customer_key", "customercompany", "customer", "customername", "shippingcity", "shippingstate"),
    "dim_products": ("product_key", "productcompany", "productnumber", "productdesc", "packaging"),
}
ENTITIES = {"sales": "Sales", "customer": "Customers", "product": "Products"}
# entity -> (CSV relation, fact foreign key, dimension primary key)
RELATIONSHIPS = {
    "customer": ("dim_customers", "customer_key", "customer_key"),
    "product": ("dim_products", "product_key", "product_key"),
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
    Field("sales", "reporting_date", "Reporting date", "date"),
    Field("sales", "sales", "Sales", "currency"),
    Field("sales", "creditsales", "Credit sales", "currency"),
    Field("sales", "shipquantitycseq", "Shipped case equivalents", "quantity"),
    Field("customer", "customer", "Customer number"),
    Field("customer", "customername", "Customer name"),
    Field("customer", "shippingcity", "Shipping city"),
    Field("customer", "shippingstate", "Shipping state"),
    Field("customer", "customercompany", "Customer company"),
    Field("product", "productnumber", "Product number"),
    Field("product", "productdesc", "Product description"),
    Field("product", "packaging", "Packaging"),
    Field("product", "productcompany", "Product company"),
)
BY_ID = {field.id: field for field in FIELDS}
MEASURES = tuple(field.column for field in FIELDS if field.measure)
PREVIEW_LIMIT = 50
STARTER = {"version": 1, "source": "sales", "mode": "summary",
           "fields": ["customer.shippingstate", "product.productnumber", "sales.sales", "sales.shipquantitycseq"],
           "order": [{"field": "sales.sales", "direction": "desc", "priority": 1}]}


class InvalidDefinition(ValueError):
    pass


def filter_operand(field, value):
    if field.measure:
        if not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)", value):
            raise InvalidDefinition("Enter a decimal number for " + field.label + ".")
        return Decimal(value)
    if field.kind == "date":
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise InvalidDefinition("Enter a valid reporting date.") from None
    return value.casefold()


def validate_filters(rules):
    if not isinstance(rules, list) or len(rules) > 32:
        raise InvalidDefinition("A report supports up to 32 filters.")
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) != {"field", "op", "value", "enabled"}:
            raise InvalidDefinition("Invalid filter format.")
        key, op, value = rule["field"], rule["op"], rule["value"]
        if not isinstance(key, str) or key not in BY_ID or type(rule["enabled"]) is not bool:
            raise InvalidDefinition("Choose an available filter field.")
        field = BY_ID[key]
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


def validate_definition(value):
    if not isinstance(value, dict) or set(value) - {"filters", "order"} != {"version", "source", "mode", "fields"}:
        raise InvalidDefinition("The report definition has an unsupported format.")
    if type(value["version"]) is not int or value["version"] != 1 or value["source"] != "sales":
        raise InvalidDefinition("The report source or definition version is unavailable.")
    if value["mode"] not in ("detail", "summary"):
        raise InvalidDefinition("Choose a detail or summary preview.")
    ids = value["fields"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= len(FIELDS):
        raise InvalidDefinition("Choose at least one available field.")
    if any(not isinstance(key, str) or key not in BY_ID for key in ids) or len(set(ids)) != len(ids):
        raise InvalidDefinition("Each selected field must be available and appear once.")
    result = {"version": 1, "source": "sales", "mode": value["mode"], "fields": list(ids)}
    if "filters" in value:
        result["filters"] = validate_filters(value["filters"])
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
