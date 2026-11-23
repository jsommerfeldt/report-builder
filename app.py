"""Single-user loopback host. The report model and CSV executor are framework independent."""

import argparse
import hmac
import http.client
import json
import re
import secrets
import webbrowser
from pathlib import Path

from flask import Blueprint, Flask, abort, jsonify, request, send_file
from itsdangerous import BadSignature, URLSafeTimedSerializer
from waitress import serve
from werkzeug.exceptions import HTTPException

from csv_source import CsvSnapshot
from local_paths import HERE, ORIGIN, PORT, active_snapshot, private_home
from model import ENTITIES, STARTER, InvalidDefinition
from report_store import LibraryConflict, NameConflict, ReportStore, RevisionConflict, check_revision


def private_key(home):
    path = home / "access.key"
    if not path.exists():
        try:
            with path.open("x", encoding="ascii") as stream:
                stream.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    key = path.read_text(encoding="ascii")
    if len(key) != 64:
        raise RuntimeError("Invalid local access key.")
    return key


def make_app(snapshot, reports, assets: Path, key, origin=ORIGIN):
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=16384, TRUSTED_HOSTS=["127.0.0.1"])
    launches = URLSafeTimedSerializer(key, salt="pilot-launch-v1")
    sessions = URLSafeTimedSerializer(key, salt="pilot-session-v1")
    api = Blueprint("report_builder", __name__, url_prefix="/api")

    @app.before_request
    def local_boundary():
        if request.remote_addr != "127.0.0.1" or request.host != origin.split("//", 1)[1]:
            abort(403)
        if not request.path.startswith("/api/"):
            return
        if request.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none"):
            abort(403)
        if request.method not in ("GET", "HEAD"):
            if request.headers.get("Origin") != origin or not request.is_json:
                abort(403)
        if request.endpoint == "report_builder.unlock":
            return
        try:
            if sessions.loads(request.cookies.get("rb_session", ""), max_age=43200) != "local":
                abort(401)
        except BadSignature:
            abort(401)

    @app.after_request
    def local_headers(response):
        response.headers.update({
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
            "Cross-Origin-Resource-Policy": "same-origin", "Cross-Origin-Opener-Policy": "same-origin",
            "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; "
                                       "connect-src 'self'; img-src 'self'; base-uri 'none'; "
                                       "frame-ancestors 'none'; form-action 'none'",
        })
        return response

    @app.errorhandler(HTTPException)
    def http_error(exc):
        return jsonify(error=exc.name), exc.code

    @app.errorhandler(InvalidDefinition)
    def invalid(exc):
        return jsonify(error=str(exc)), 400

    @app.errorhandler(RevisionConflict)
    def conflict(_exc):
        return jsonify(error="This item changed in another window. Reopen it to use the latest version."), 409

    @app.errorhandler(LibraryConflict)
    def library_conflict(exc):
        return jsonify(error=str(exc)), 409

    @api.errorhandler(FileNotFoundError)
    def missing_item(_exc):
        return jsonify(error="This item is no longer available in the library."), 404

    @app.errorhandler(NameConflict)
    def name_conflict(exc):
        return jsonify(error="A different report already has that name.", overwriteTarget=exc.target), 409

    @api.post("/session")
    def unlock():
        body = request.get_json()
        token = body.get("token") if isinstance(body, dict) else None
        try:
            if not isinstance(token, str) or launches.loads(token, max_age=120) != "open":
                abort(403)
        except BadSignature:
            abort(403)
        response = jsonify(ok=True)
        response.set_cookie("rb_session", sessions.dumps("local"), httponly=True, secure=True,
                            samesite="Strict", path="/api", max_age=43200)
        return response

    @api.get("/catalog")
    def catalog():
        return jsonify(entities=ENTITIES, fields=[{"id": f.id, "entity": f.entity, "label": f.label,
                       "kind": f.kind, "measure": f.measure} for f in snapshot.fields],
                       counts=snapshot.counts, scope=snapshot.scope, starter={**STARTER, "version": snapshot.version})

    @api.post("/preview")
    def preview():
        return jsonify(snapshot.preview(request.get_json()))

    @api.post("/values")
    def field_values():
        return jsonify(snapshot.choices(request.get_json()))

    @api.get("/reports")
    def report_list():
        return jsonify(reports=reports.list())

    @api.get("/library")
    def library():
        return jsonify(reports.library())

    @api.post("/folders")
    def create_folder():
        return jsonify(reports.change_folder("create", request.get_json())), 201

    @api.route("/folders/<uuid:fid>", methods=["PATCH", "DELETE"])
    def manage_folder(fid):
        action = "update" if request.method == "PATCH" else "delete"
        return jsonify(reports.change_folder(action, request.get_json(), str(fid)))

    @api.route("/reports/<uuid:rid>", methods=["PATCH", "DELETE"])
    def manage_report(rid):
        action = "move" if request.method == "PATCH" else "trash"
        return jsonify(reports.change_report(action, str(rid), request.get_json()))

    @api.post("/reports/<uuid:rid>/restore")
    def restore_report(rid):
        return jsonify(reports.change_report("restore", str(rid), request.get_json()))

    @api.delete("/trash/<uuid:rid>")
    def delete_trashed_report(rid):
        reports.delete_trashed_report(str(rid), request.get_json())
        return jsonify(ok=True)

    @api.get("/reports/<uuid:rid>/results")
    def report_results(rid):
        raw_offset = request.args.get("offset", "0")
        revision = request.args.get("revision", "")
        if not re.fullmatch(r"[0-9]{1,10}", raw_offset) or not re.fullmatch(r"[0-9]{1,10}", revision):
            raise InvalidDefinition("Invalid report page or revision.")
        record = reports.get(str(rid))
        check_revision(record, int(revision))
        return jsonify(snapshot.preview(record["definition"], offset=int(raw_offset)))

    @api.get("/reports/<uuid:rid>")
    def read_report(rid):
        try:
            record = reports.get(str(rid))
            return jsonify({**record, "definition": snapshot.definition(record["definition"])})
        except FileNotFoundError:
            abort(404)

    @api.post("/reports")
    def create_report():
        payload = request.get_json()
        record = reports.save(payload, validate=snapshot.definition)
        return jsonify(record), 200 if "overwrite" in payload else 201

    @api.put("/reports/<uuid:rid>")
    def update_report(rid):
        try:
            return jsonify(reports.save(request.get_json(), str(rid), validate=snapshot.definition))
        except FileNotFoundError:
            abort(404)

    app.register_blueprint(api)

    @app.get("/")
    def index():
        return send_file(HERE / "ui" / "index.html")

    @app.get("/assets/<name>")
    def asset(name):
        if name in ("mark.svg", "superset-logo-horiz.png"):
            return send_file(HERE / "ui" / name)
        if name in ("builder.js", "builder.css"):
            return send_file(assets / name)
        abort(404)

    @app.get("/health")
    def health():
        challenge = request.args.get("challenge", "")
        proof = hmac.digest(key.encode(), ("host:" + challenge).encode(), "sha256").hex() if re.fullmatch("[0-9a-f]{32}", challenge) else None
        return jsonify(service="rdwdw-csv-report-builder", version=1, proof=proof)

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["serve", "open"])
    args = parser.parse_args()
    home = private_home()
    key = private_key(home)
    if args.action == "open":
        challenge = secrets.token_hex(16)
        connection = http.client.HTTPConnection("127.0.0.1", PORT, timeout=3)
        try:
            connection.request("GET", "/health?challenge=" + challenge)
            proof = json.load(connection.getresponse()).get("proof")
        finally:
            connection.close()
        expected = hmac.digest(key.encode(), ("host:" + challenge).encode(), "sha256").hex()
        if not isinstance(proof, str) or not hmac.compare_digest(proof, expected):
            raise RuntimeError("The listener is not this profile's pilot.")
        token = URLSafeTimedSerializer(key, salt="pilot-launch-v1").dumps("open")
        webbrowser.open_new_tab(f"{ORIGIN}/#unlock={token}")
        return
    assets = home / "ui" / "dist"
    if not all((assets / name).is_file() for name in ("builder.js", "builder.css")):
        raise RuntimeError("Build the local frontend first.")
    app = make_app(CsvSnapshot(active_snapshot(home)), ReportStore(home / "reports"), assets, key)
    serve(app, host="127.0.0.1", port=PORT, threads=4, max_request_body_size=16384,
          connection_limit=32, channel_timeout=30, expose_tracebacks=False, ident="report-builder")


if __name__ == "__main__":
    main()
