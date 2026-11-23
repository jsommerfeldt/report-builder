"""Offline regression checks with synthetic data only. Run python -m unittest test_pilot."""

import csv
import json
import tempfile
import unittest
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from itsdangerous import URLSafeTimedSerializer

from app import make_app
from csv_source import CsvSnapshot, file_hash
from local_paths import ORIGIN
from model import CSV_COLUMNS, LEGACY_COLUMNS, InvalidDefinition
from report_store import ReportStore


class PilotTest(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.path = Path(scratch.name)
        tables = {
            "fact_sales": [
                (1, 30, 8, 1, "2026-11-09", 2, 3, "14.20", 0, "1.2500"),
                (1, 30, 8, 2, "2026-11-09", 2, 3, "-2.10", "2.10", ".0001"),
                (2, 30, 9, 1, "2026-11-10", 4, 5, None, 0, None)],
            "dim_customers": [(2, "0030", "000002", "Sample", "Duluth", "MN"),
                              (4, "0030", "000004", "Sample", "", "~NO")],
            "dim_products": [(3, "0030", "00003", "Apples", "40 LB"), (5, "0030", "00005", "Apples", None)],
        }
        for table, rows in tables.items():
            with (self.path / f"{table}.csv").open("w", newline="", encoding="utf-8") as output:
                writer = csv.writer(output, quoting=csv.QUOTE_NOTNULL)
                writer.writerow(LEGACY_COLUMNS[table])
                writer.writerows(rows)
        self.manifest = {"scope": {"company": "0030", "from": "2026-11-09", "through": "2026-11-15"},
                         "sha256": {t: file_hash(self.path / f"{t}.csv") for t in tables},
                         "verification": {"passed": True, "dimension_rows": {"customers": 2, "products": 2},
                                          "before_joins": {"rows": 3, "sales": "12.10", "creditsales": "2.10",
                                                           "shipquantitycseq": "1.2501"}}}
        (self.path / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        self.snapshot = CsvSnapshot(self.path)
        self.d = {"version": 1, "source": "sales", "mode": "summary",
                  "fields": ["customer.shippingstate", "product.productnumber", "sales.sales", "sales.shipquantitycseq"]}
        self.key = "a" * 64
        self.reports = self.path / "reports"

    def client(self):
        return make_app(self.snapshot, ReportStore(self.reports), self.path, self.key).test_client()

    def sign_in(self, client):
        token = URLSafeTimedSerializer(self.key, salt="pilot-launch-v1").dumps("open")
        return client.post("/api/session", json={"token": token}, base_url=ORIGIN, headers={"Origin": ORIGIN})

    def test_report_semantics(self):
        data = self.snapshot.preview(self.d)
        self.assertEqual(data["rows"], [["MN", "00003", "12.10", "1.2501"], ["~NO", "00005", None, None]])
        detail = self.snapshot.preview({**self.d, "mode": "detail", "fields": ["customer.shippingcity", "product.packaging"]})
        self.assertEqual(detail["rows"], [["Duluth", "40 LB"], ["Duluth", "40 LB"], ["", None]])
        duplicate_labels = self.snapshot.preview({**self.d, "fields": ["product.productdesc"]})
        self.assertEqual(duplicate_labels["rows"], [["Apples"]])
        for fields in ([], ["arbitrary"], ["sales.sales", "sales.sales"]):
            with self.assertRaises(InvalidDefinition):
                self.snapshot.preview({**self.d, "fields": fields})

    def test_snapshot_integrity(self):
        with (self.path / "fact_sales.csv").open("a", encoding="utf-8") as f:
            f.write("\n")
        with self.assertRaisesRegex(ValueError, "checksum"):
            CsvSnapshot(self.path)

    def test_expanded_scope_and_unassigned_trip(self):
        saved = ReportStore(self.reports).save({"name": "Legacy sales", "definition": self.d})
        original_rows = self.snapshot.preview(self.d)["rows"]
        expanded = self.path / "expanded"
        expanded.mkdir()
        for table, columns in CSV_COLUMNS.items():
            with (expanded / f"{table}.csv").open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, columns, quoting=csv.QUOTE_NOTNULL)
                writer.writeheader()
                if table == "fact_sales":
                    legacy_facts = self.snapshot.facts
                    writer.writerows({**row, "company": "0030", "trip_key": "7"} for row in legacy_facts)
                    writer.writerow({**legacy_facts[0], "company_key": "1", "company": "0001",
                                     "trip_key": None, "sales": "20", "creditsales": "0", "shipquantitycseq": "2"})
                elif table == "dim_trips":
                    writer.writerow({"trip_key": "7", "tripnumber": "000007", "tripdescription": "Sample trip",
                                     "dispatchdate": "2026-11-10"})
                elif table == "dim_customers":
                    writer.writerows({**row, "shippingzip": "00501", "customerregiondescription": "North"}
                                     for row in self.snapshot.dimensions["customer"].values())
                else:
                    writer.writerows({**row, "commoditydescription": "Apples"}
                                     for row in self.snapshot.dimensions["product"].values())
        control = {
            "passed": True, "dimension_rows": {"customers": 2, "products": 2, "trips": 1},
            "before_joins": {"rows": 4, "sales": "32.10", "creditsales": "2.10", "shipquantitycseq": "3.2501"},
            "by_company": {"0030": self.manifest["verification"]["before_joins"],
                           "0001": {"rows": 1, "sales": "20", "creditsales": "0", "shipquantitycseq": "2"}},
        }
        (expanded / "manifest.json").write_text(json.dumps({
            "snapshot_version": 2, "scope": {"companies": ["0001", "0030"]},
            "sha256": {table: file_hash(expanded / f"{table}.csv") for table in CSV_COLUMNS},
            "verification": control,
        }), encoding="utf-8")
        snapshot = CsvSnapshot(expanded)
        definition = {**self.d, "version": 2, "fields": ["sales.company", "product.commoditydescription",
                      "customer.customerregiondescription", "trip.tripnumber", "sales.sales"]}
        self.assertEqual(snapshot.preview(definition)["rows"], [
            ["0001", "Apples", "North", None, "20"], ["0030", "Apples", "North", "000007", "12.10"],
        ])
        detail = {**definition, "mode": "detail"}
        self.assertEqual(snapshot.preview(detail)["total"], 4)
        detail["filters"] = [{"field": "trip.tripnumber", "op": "blank", "value": "", "enabled": True}]
        self.assertEqual(snapshot.preview(detail)["rows"], [["0001", "Apples", "North", None, "20"]])
        self.assertEqual(snapshot.choices({"field": "customer.shippingzip"})["values"], ["00501"])
        self.assertEqual(snapshot.choices({"field": "sales.company", "version": 1})["values"], ["0030"])
        self.snapshot = snapshot
        client = self.client()
        self.sign_in(client)
        results = client.get(f"/api/reports/{saved['id']}/results?revision=1", base_url=ORIGIN)
        self.assertEqual(results.status_code, 200)
        self.assertEqual(results.json["rows"], original_rows)
        self.assertEqual(results.json["sourceRows"], 3)

    def test_filters_before_grouping_and_in_detail(self):
        rules = [
            {"field": "customer.shippingstate", "op": "eq", "value": "mn", "enabled": True},
            {"field": "sales.sales", "op": "gte", "value": "0", "enabled": True},
        ]
        d = {**self.d, "fields": ["sales.sales"], "filters": rules}
        self.assertEqual(self.snapshot.preview(d)["rows"], [["14.20"]])
        rules[1]["enabled"] = False
        self.assertEqual(self.snapshot.preview(d)["rows"], [["12.10"]])
        self.assertEqual(self.snapshot.preview({**d, "mode": "detail"})["total"], 2)
        rules[0]["value"] = "XX"
        self.assertEqual(self.snapshot.preview(d)["total"], 0)
        rules[0]["enabled"] = False
        self.assertEqual(self.snapshot.preview({**d, "mode": "detail"})["total"], 3)
        store = ReportStore(self.reports)
        record = store.save({"name": "Filters", "definition": d})
        self.assertEqual(store.get(record["id"])["definition"]["filters"], rules)

    def test_typed_filters(self):
        for field, op, value, expected in [
            ("product.packaging","blank","",1), ("product.productdesc","contains","pPl",3),
            ("sales.reporting_date","lte","2026-11-09",2), ("product.productnumber","eq","00003",2),
        ]:
            rule = {"field": field, "op": op, "value": value, "enabled": True}
            self.assertEqual(self.snapshot.preview({**self.d,"mode":"detail","filters":[rule]})["total"], expected)
        for field, op, value in [("unknown","eq","1"), ("sales.sales","gte","nan"),
                                 ("sales.reporting_date","lte","2026-13-02"), ("sales.sales","contains","1")]:
            with self.assertRaises(InvalidDefinition):
                self.snapshot.preview({**self.d,"filters":[{"field":field,"op":op,"value":value,"enabled":True}]})

    def test_local_boundaries(self):
        client = self.client()
        self.assertEqual(client.post("/api/values", base_url=ORIGIN, headers={"Origin":ORIGIN},
                                     json={"field":"customer.customer","query":""}).status_code,401)
        self.assertEqual(client.get("/api/catalog", base_url=ORIGIN).status_code, 401)
        login = self.sign_in(client)
        self.assertEqual(login.status_code, 200)
        self.assertIn("HttpOnly", login.headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", login.headers["Set-Cookie"])
        self.assertIn("Secure", login.headers["Set-Cookie"])
        self.assertEqual(client.get("/api/catalog", base_url=ORIGIN).status_code, 200)
        self.assertEqual(client.get("/api/catalog", base_url=ORIGIN, headers={"Sec-Fetch-Site": "cross-site"}).status_code, 403)
        self.assertEqual(client.post("/api/preview", base_url=ORIGIN, json=self.d).status_code, 403)
        self.assertEqual(client.post("/api/preview", base_url=ORIGIN, json=self.d, headers={"Origin": ORIGIN}).status_code, 200)
        for path in ("/assets/fact_sales.csv", "/csv/fact_sales.csv", "/access.key", "/reports/"):
            self.assertEqual(client.get(path, base_url=ORIGIN).status_code, 404)
        self.assertNotEqual(client.get("/api/catalog", base_url="http://example.invalid").status_code, 200)

    def test_save_reopen_update_and_stale_revision(self):
        client = self.client()
        self.sign_in(client)
        options = {"base_url": ORIGIN, "headers": {"Origin": ORIGIN}}
        response = client.post("/api/reports", json={"name": "Fixture", "definition": self.d}, **options)
        self.assertEqual(response.status_code, 201)
        record = response.get_json()
        self.assertNotIn("rows", record)
        route = "/api/reports/" + record["id"]
        reopened = self.client()
        self.sign_in(reopened)
        self.assertEqual(reopened.get(route, base_url=ORIGIN).get_json()["definition"], self.d)
        update = {"name": "Revised", "definition": {**self.d, "mode": "detail"}, "revision": 1}
        self.assertEqual(reopened.put(route, json=update, **options).get_json()["revision"], 2)
        self.assertEqual(client.put(route, json=update, **options).status_code, 409)
        self.assertEqual(reopened.get("/api/reports", base_url=ORIGIN).get_json()["reports"][0]["name"], "Revised")

    def test_value_picker_and_custom_values(self):
        self.assertEqual(self.snapshot.choices({"field":"product.productnumber","query":"003"})["values"], ["00003"])
        self.assertEqual(self.snapshot.choices({"field":"product.productdesc","query":"PP","offset":1}), {"total":1,"values":[]})
        rule={"field":"customer.shippingstate","op":"in","value":["mn","NEW"],"enabled":True}
        d={**self.d,"filters":[rule],"mode":"detail"}
        self.assertEqual(self.snapshot.preview(d)["total"],2)
        rule["value"].append("~NO")
        self.assertEqual(self.snapshot.preview(d)["total"],3)
        rule.update(field="sales.sales",value=["-2.1","999"])
        self.assertEqual(self.snapshot.preview(d)["total"],1)
        rule["value"]=[]
        with self.assertRaises(InvalidDefinition):
            self.snapshot.preview(d)

    def test_order_after_aggregation_and_before_preview_limit(self):
        order=[{"field":"product.productnumber","direction":"desc"},{"field":"sales.sales","direction":"asc"}]
        d={**self.d,"order":order}
        self.assertEqual([r[1] for r in self.snapshot.preview(d)["rows"]],["00005","00003"])
        self.snapshot.facts=self.snapshot.facts*30
        result=self.snapshot.preview({**d,"mode":"detail"})
        self.assertEqual(result["total"],90)
        self.assertEqual(len(result["rows"]),50)
        self.assertEqual(result["rows"][29][1],"00005")
        self.assertEqual(result["rows"][30][2],"-2.10")
        with self.assertRaises(InvalidDefinition):
            self.snapshot.preview({**d,"fields":["sales.sales"]})

    def test_legacy_field_sequence_supplies_initial_priority(self):
        state, product = self.d["fields"][:2]
        # A legacy definition can list its sort keys in a different order.
        keys = [{"field": product, "direction": "desc"}, {"field": state, "direction": "asc"}]
        for mode in ("detail", "summary"):
            d = {**self.d, "mode":mode, "order":keys}
            self.assertEqual(self.snapshot.preview(d)["rows"][0][0], "MN")
            d["fields"] = [product, state]
            self.assertEqual(self.snapshot.preview(d)["rows"][0][0], "00005")
            d["order"] = [{**keys[0], "enabled":False}, keys[1]]
            self.assertEqual(self.snapshot.preview(d)["rows"][0][0], "00003")
        saved = ReportStore(self.reports).save({"name":"Field switches","definition":d})
        self.assertIn({**keys[0],"enabled":False},saved["definition"]["order"])
        with self.assertRaises(InvalidDefinition):
            self.snapshot.preview({**d,"order":[{**keys[0],"enabled":0}]})

    def test_explicit_precedence_is_independent_of_projection(self):
        state, product = self.d["fields"][:2]
        state_sort = {"field":state,"direction":"asc","priority":1}
        product_sort = {"field":product,"direction":"desc","priority":2}
        for mode in ("summary","detail"):
            def pairs(fields, order):
                result = self.snapshot.preview({**self.d,"fields":fields,"order":order,"mode":mode})
                self.assertEqual(result["fields"],fields)
                return [(row[fields.index(state)],row[fields.index(product)]) for row in result["rows"]]
            order = [product_sort, state_sort]
            original = pairs([state,product], order)
            self.assertEqual(original[0], ("MN","00003"))
            self.assertEqual(pairs([product,state], order), original)
            swapped = [{**state_sort,"priority":2}, {**product_sort,"priority":1}]
            self.assertEqual(pairs([state,product],swapped)[0], ("~NO","00005"))

    def test_invalid_precedence(self):
        state, product = self.d["fields"][:2]
        first = {"field":state,"direction":"asc","priority":1}
        second = {"field":product,"direction":"asc"}
        for extra in ({"priority":1},{"priority":3},{"priority":False},{"priority":"2"},{},{"enabled":False,"priority":2}):
            with self.subTest(extra=extra), self.assertRaises(InvalidDefinition):
                self.snapshot.preview({**self.d,"order":[first,{**second,**extra}]})

    def test_all_sorts_off_uses_source_order(self):
        self.snapshot.facts.reverse()
        for mode in ("summary", "detail"):
            d = {**self.d, "mode":mode, "order":[{"field":"sales.sales","direction":"desc","enabled":False}]}
            self.assertEqual(self.snapshot.preview(d)["rows"][0][0], "~NO")

    def test_name_collision_confirmation(self):
        client=self.client(); self.sign_in(client)
        opts={"base_url":ORIGIN,"headers":{"Origin":ORIGIN}}
        def create(name):
            return client.post("/api/reports",json={"name":name,"definition":self.d},**opts).get_json()
        a,b=create("Original"),create("Target")
        payload={"name":" target ","definition":{**self.d,"mode":"detail"}}
        conflict=client.post("/api/reports",json=payload,**opts)
        self.assertEqual(conflict.status_code,409)
        self.assertEqual(conflict.get_json()["overwriteTarget"]["id"],b["id"])
        route="/api/reports/"+a["id"]
        payload["revision"]=a["revision"]
        self.assertEqual(client.put(route,json=payload,**opts).status_code,409)
        self.assertEqual(client.get("/api/reports/"+b["id"],base_url=ORIGIN).get_json()["definition"],self.d)
        payload["overwrite"]={"id":b["id"],"revision":b["revision"]}
        replaced=client.put(route,json=payload,**opts).get_json()
        self.assertEqual((replaced["id"],replaced["revision"]),(b["id"],2))
        self.assertEqual(client.get(route,base_url=ORIGIN).get_json(),a)
        self.assertEqual(client.put(route,json=payload,**opts).status_code,409)


    def test_folder_membership_trash_and_restore(self):
        c = self.client()
        opts = {"base_url": ORIGIN, "headers": {"Origin": ORIGIN}}
        self.assertEqual(c.get("/api/library", base_url=ORIGIN).status_code, 401)
        self.sign_in(c)
        def folder(name, parent=None):
            return c.post("/api/folders", json={"name": name, "parentId": parent}, **opts)
        team = folder("Sales").get_json()
        team_url = "/api/folders/" + team["id"]
        zone = folder("North", team["id"]).get_json()
        self.assertEqual(folder(" SALES ").status_code, 409)
        self.assertEqual(c.patch(team_url, json={"name":"Sales","parentId":zone["id"],"revision":1}, **opts).status_code, 400)
        self.assertEqual(folder("North").status_code, 201)
        self.assertEqual(c.delete(team_url, json={"revision":1}, **opts).status_code, 409)
        rep = c.post("/api/reports", json={"name":"Weekly","definition":self.d}, **opts).get_json()
        url = "/api/reports/" + rep["id"]
        # Simulate a definition written before folder membership was introduced.
        path = self.reports / (rep["id"] + ".json")
        rep.pop("folderId")
        path.write_text(json.dumps(rep), encoding="utf-8")
        self.assertEqual(c.get("/api/library", **opts).get_json()["reports"][0]["name"], "Weekly")
        self.assertEqual(c.patch(url, json={"revision":1,"folderId":"missing"}, **opts).status_code, 409)
        moved = c.patch(url, json={"revision":1,"folderId":zone["id"]}, **opts).get_json()
        self.assertEqual(moved["folderId"], zone["id"])
        self.assertEqual(c.delete(url, json={"revision":1}, **opts).status_code, 409)
        self.assertEqual(c.delete("/api/folders/"+zone["id"], json={"revision":2}, **opts).status_code, 409)
        self.assertEqual(c.delete(url, json={"revision":2}, base_url=ORIGIN).status_code, 403)
        self.assertEqual(c.delete(url, json={"revision":2}, **opts).status_code, 200)
        for suffix in ("", "/results?revision=3"):
            self.assertEqual(c.get(url+suffix, **opts).status_code, 404)
        self.assertEqual(c.get("/api/reports", **opts).get_json()["reports"], [])
        self.assertEqual(c.delete("/api/folders/"+zone["id"], json={"revision":1}, **opts).status_code, 200)
        other = c.post("/api/reports", json={"name":"Weekly","definition":self.d}, **opts).get_json()
        restored = c.post(url + "/restore", json={"revision":4}, **opts).get_json()
        self.assertEqual((restored["id"],restored["name"],restored["folderId"]), (rep["id"],"Weekly (restored)",team["id"]))
        self.assertNotEqual(restored["id"], other["id"])
        self.assertEqual(self.client().get(url, **opts).status_code, 401)
        self.assertEqual(ReportStore(self.reports).get(rep["id"])["definition"], self.d)

    def test_permanent_delete_only_current_trashed_report(self):
        client = self.client()
        self.sign_in(client)
        options = {"base_url": ORIGIN, "headers": {"Origin": ORIGIN}}
        report = client.post("/api/reports", json={"name": "Disposable", "definition": self.d}, **options).get_json()
        retained = client.post("/api/reports", json={"name": "Keep", "definition": self.d}, **options).get_json()
        report_id = report["id"]
        report_url = "/api/reports/" + report_id
        purge_url = "/api/trash/" + report_id
        saved_file = self.reports / (report_id + ".json")

        self.assertEqual(client.delete(purge_url, json={"revision": 1}, **options).status_code, 409)
        trashed = client.delete(report_url, json={"revision": 1}, **options).get_json()
        self.assertEqual(self.client().delete(purge_url, json={"revision": 2}, **options).status_code, 401)
        self.assertEqual(client.delete(purge_url, json={"revision": 2}, base_url=ORIGIN).status_code, 403)
        self.assertEqual(client.delete(purge_url, json={"revision": 1}, **options).status_code, 409)
        self.assertTrue(saved_file.is_file())

        restored = client.post(report_url + "/restore", json={"revision": trashed["revision"]}, **options).get_json()
        self.assertEqual(client.delete(purge_url, json={"revision": trashed["revision"]}, **options).status_code, 409)
        self.assertEqual(client.delete(purge_url, json={"revision": restored["revision"]}, **options).status_code, 409)
        trashed = client.delete(report_url, json={"revision": restored["revision"]}, **options).get_json()
        purge = {"revision": trashed["revision"]}
        response = client.delete(purge_url, json=purge, **options)
        self.assertEqual((response.status_code, response.get_json()), (200, {"ok": True}))
        self.assertFalse(saved_file.exists())
        self.assertEqual(client.delete(purge_url, json=purge, **options).status_code, 404)
        self.assertEqual(client.post(report_url + "/restore", json=purge, **options).status_code, 404)
        self.assertEqual([entry["id"] for entry in ReportStore(self.reports).library()["reports"]], [retained["id"]])

    def test_delete_populated_folder(self):
        store = ReportStore(self.reports)
        parent = store.change_folder("create", {"name":"Sales","parentId":None})
        child = store.change_folder("create", {"name":"West","parentId":parent["id"]})
        report = store.save({"name":"Weekly","definition":self.d,"folderId":parent["id"]})
        store.change_folder("delete", {"revision":1}, parent["id"])
        self.assertEqual(store.library()["folders"], [{**child,"parentId":None,"revision":2}])
        saved = store.get(report["id"])
        self.assertIsNone(saved["folderId"])
        self.assertEqual(saved["definition"], self.d)

    def test_overwrite_retains_target_folder(self):
        store = ReportStore(self.reports)
        folder = store.change_folder("create", {"name":"Sales","parentId":None})
        target = store.save({"name":"Revenue","definition":self.d,"folderId":folder["id"]})
        rewritten = store.save({"name":"Revenue","definition":self.d,"folderId":None,
                                "overwrite":{"id":target["id"],"revision":1}})
        self.assertEqual((rewritten["id"],rewritten["folderId"]),(target["id"],folder["id"]))

    def test_saved_result_pages_respect_filters_order_and_revision(self):
        first = self.snapshot.facts[0]
        self.snapshot.facts = [{**first,"reporting_date":(date(2025,1,1)+timedelta(days=i)).isoformat(),
                                "sales":Decimal(i)} for i in range(121)]
        client = self.client()
        self.sign_in(client)
        opts = {"base_url":ORIGIN,"headers":{"Origin":ORIGIN}}
        for mode in ("summary","detail"):
            for filtered in (False,True):
                for sorted_rows in (False,True):
                    with self.subTest(mode=mode,filtered=filtered,sorted_rows=sorted_rows):
                        d = {**self.d,"mode":mode,"fields":["sales.reporting_date","sales.sales"]}
                        if filtered:
                            d["filters"] = [{"field":"sales.sales","op":"gte","value":"7","enabled":True}]
                        if sorted_rows:
                            d["order"] = [{"field":"sales.sales","direction":"desc","enabled":True}]
                        name = f"{mode}-{filtered}-{sorted_rows}"
                        report = client.post("/api/reports", json={"name":name,"definition":d}, **opts).get_json()
                        route = "/api/reports/" + report["id"] + "/results"
                        expected = list(range(7 if filtered else 0,121))
                        if sorted_rows:
                            expected.reverse()
                        found = []
                        for offset in (0,50,100,150):
                            page = client.get(route, query_string={"offset":offset,"revision":1}, **opts).get_json()
                            self.assertEqual(page["total"], len(expected))
                            found.extend(int(row[1]) for row in page["rows"])
                        self.assertEqual(found, expected)
                        self.assertEqual(client.get(route+"?revision=2", **opts).status_code, 409)
                        self.assertEqual(client.get(route+"?revision=1&offset=-1", **opts).status_code, 400)


if __name__ == "__main__":
    unittest.main()
