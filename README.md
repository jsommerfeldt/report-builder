# Dataset Builder

A single-user CSV pilot for building sales datasets. A fresh profile starts with an empty dataset library and the [bundled sales snapshot](bundled-snapshot/manifest.json).

## Quick start on Windows

Install Python 3.13 through the Windows Python launcher, Node.js 24, and pnpm 11. From the repository root, run the following in PowerShell.

```powershell
.\pilot.ps1 -Action Build -NoBrowser
.\pilot.ps1 -Action Start
```

Build downloads the pinned Python and frontend dependencies. Start launches the local service and opens an authorized browser tab at `http://127.0.0.1:8784`. For later launches, double-click **Open Report Builder.cmd** or run `.\pilot.ps1 -Action Open` if the service is already running. An agent can use `Start -NoBrowser` followed by `Status`, then hand off with `Open` to launch the browser.

Choose **New dataset**, add **Sales Company** and **Sales** from Objects, and click the play icon at the bottom of the sidebar. Preview shows totals for `0001` and `0030`.

The [bundled snapshot](bundled-snapshot/) contains the complete pilot export for companies `0001` and `0030` from November 9 through 15, 2026, inclusive. It contains 233,735 sales rows and the corresponding customer, product, trip, and warehouse tables. The app reads these five CSVs directly on a fresh profile and verifies their hashes, relationships, row counts, and totals against the manifest at startup. Running the bundled export requires no PostgreSQL client, warehouse credentials, or saved dataset files.

The Windows runtime and saved datasets live under `%LOCALAPPDATA%\RDWDW\ReportBuilderPilot`. To isolate a test from an existing profile, stop its running service first, then set `$env:REPORT_BUILDER_HOME = Join-Path $env:LOCALAPPDATA 'RDWDW/ReportBuilderTest'` before building and starting. Use the same environment setting for later commands in the test profile. Both profiles use port 8784.

## Manual setup on macOS or Linux

Use Python 3.13, Node.js 24, and pnpm 11. From the repository root, choose an absolute path for the runtime using `REPORT_BUILDER_HOME`.

```sh
export REPORT_BUILDER_HOME="$PWD/.venv/pilot"
python3.13 -m venv "$REPORT_BUILDER_HOME/venv"
"$REPORT_BUILDER_HOME/venv/bin/python" -m pip install -r requirements.txt
pnpm --dir ui install --frozen-lockfile --ignore-scripts
pnpm --dir ui run build
mkdir -p "$REPORT_BUILDER_HOME/ui/dist"
cp ui/dist/builder.js ui/dist/builder.css "$REPORT_BUILDER_HOME/ui/dist/"
"$REPORT_BUILDER_HOME/venv/bin/python" -B app.py serve
```

Leave the server running. In a second terminal, set the same `REPORT_BUILDER_HOME` and run `"$REPORT_BUILDER_HOME/venv/bin/python" -B app.py open` from the repository root to open the authorized browser tab.

## Use the builder

The pilot opens to **Datasets**. Search by name, choose a **Location** to browse folders or Trash, or sort by **Name** or **Last modified**. Select a dataset name or **Run** to see a read-only result with 50 rows per page. **Edit** opens the dataset in the builder. **New dataset** starts an empty definition in the current folder.

Open **Folders** and use the plus beside its heading to create a folder or subfolder. Open a folder and choose **Manage folder** to rename or move it. A report's **…** button moves it to another folder or to **Trash**. Restore a report from Trash to return it to its former folder, or to the library root if that folder was removed. If its name has been reused, the restored copy receives a suffix. Choose the trash icon beside a folder or choose **Delete folder** in **Manage folder**. Confirming moves its reports and subfolders up one level.

In **Trash**, choose **Delete permanently** and confirm to remove a saved report. This also removes its schedule draft from the browser where you confirm the deletion.

**Schedule** opens a delivery draft for the selected report. Choose a recurrence, local time, time zone and To, Cc and Bcc recipients. One draft per report is saved in this browser profile. Opening Schedule again lets you edit or remove it. Email delivery is inactive.

1. In **Objects**, expand Sales, Customers, Products, Trips, or Warehouses, or search for a field. Click fields or drag them into **Columns** in **Query**. Drag columns to reorder them. **Warehouse Code**, **Warehouse Name**, and **Warehouse Company** describe the warehouse recorded on the sale.
2. In **Columns**, non-numeric fields group the results by default. For numeric fields, use the dropdown to choose a calculation. **Count** counts nonblank values, and **None** keeps a column for detail rows. When no columns define groups, clear **Totals only** to see one row per sale. The **?** icon shows both views.
3. In **Columns**, turn on **Sort** for each visible column and choose **Asc** or **Desc**. **Run preview** at the bottom of the sidebar displays the first 50 matching rows after sorting and sizes columns to those rows. Hover over a column name to see its original table and column, or click the name to edit it in place.
4. Choose **Save dataset** and give the definition a name. Choose **Datasets** to return to the library. Saving an existing dataset updates its revision. If another tab saved first, reopen that revision before editing again.

With no groups selected, **Totals only** calculates the selected aggregations across all matching sales in one row.

With the expanded snapshot active, a new report includes sales for `0001` and `0030`. Use **Sales Company** to group or filter by the company on the sale. Older reports still use `0030` and open with an editable **Sales Company** filter. Change or remove that filter to adjust the scope, then run the preview and save the report. An unassigned trip displays blank trip fields.

Click **Objects** to collapse it into an icon sidebar. The Objects icon reopens the list, and the Query icon opens the query panel over **Preview** in either layout. Drag the Query title bar to move it and any edge or corner to resize it. When focused, the move and resize handles also respond to arrow keys. Close Query with the same button, the close icon, or Escape.

Drop a field onto **Preview** to see its column header immediately and open Query with **Columns** expanded. Run Preview to load values. Drag a field between **Columns** and **Filters** to move it or hold **Ctrl** while dropping to copy it. For a new filter, **Apply filter** completes the move and **Cancel** restores the column. Moving a field into **Columns** removes all filter rules for that field. With a field’s move handle focused, **Shift+Down** moves a column into Filters and **Shift+Up** moves a filtered field into Columns.

Drag a field by its name or grip to move its output column, or focus it and press the up/down arrows. Use **Priority** to order the enabled sorts independently. Priority **1** sorts first and **2** breaks its ties. Choosing a priority shifts the other ranks automatically. New or re-enabled sorts take the last priority. Disabling a sort remembers its direction and releases its rank. With all sorts off, rows and summary groups follow their first occurrence in the filtered source. Older saved definitions start with the precedence they had under column-based sorting.

Drag a preview header by its label to move the column and its values immediately. The numbered **Column Order** list in **Columns** follows that move. A focused header label also supports left and right arrow keys. Use **Sort**, **Priority**, and **Direction** to order the rows. After adding or removing fields, run the preview to enable header dragging for the new selection.

Drag the right edge of any preview column header to widen or narrow it. A focused divider also responds to left and right arrow keys. Widths follow their columns and carry over when rerunning a preview in the same editor session. **Auto-fit columns** restores automatic sizing.

Drag a library field into **Filters**, or choose **Add filter**. With **is any of**, search the CSV values, check one or more, or type a custom value and choose **Use**. Turn on **Match case** to match text exactly as capitalized. For a date or date and time field, **relative to now** recalculates when the report runs. Days and weeks include today, and date and time fields also support hours counted from the current local time. Choose **Apply filter**, then **Run preview**. Any chosen value can match within a rule, and all enabled rules must match before totals are calculated.

Click the title to rename the draft. Choose **Apply title**, then **Save dataset** to persist it. Saving under another dataset's name prompts for confirmation. **Replace dataset** updates the named target. When editing a different previously saved dataset, its original definition stays available under its original name.

## Warehouse snapshot for authorized users

Use these commands when explicitly testing against the configured warehouse on Windows. Export also needs the PostgreSQL client on PATH and access to the warehouse.

```powershell
.\pilot.ps1 -Action Build
.\pilot.ps1 -Action Export
.\pilot.ps1 -Action Stop
.\pilot.ps1 -Action Activate
.\pilot.ps1 -Action Start
.\pilot.ps1 -Action Status
```

**Build** installs pinned Python packages and builds the locked React 17/TypeScript project in the local profile. **Export** uses the read-only warehouse interface in `sales_pilot.sql` for companies `0001` and `0030` and Sales reporting dates November 9–15, 2026. Set `RDWDW_URL` in the export environment or use `RDWDW_ENV_FILE` for the existing warehouse environment file. The default file is the sibling OneDrive `rdwdw/.env`. The browser server reads only local files.

The five CSVs and reconciliation manifest are staged in `csv-expanded-v2-warehouse` under `%LOCALAPPDATA%\RDWDW\ReportBuilderPilot`. The Sales warehouse comes from `fact_sales.warehouse_key` joined to `dim_warehouses.warehouse_key`. Earlier snapshots remain available. One read-only SELECT supplies the records, direct SQL summary, and reconciliation controls. The exporter checks fact grain, dimension keys, row counts, and exact decimal totals by sales company and combined. It compares grouped totals across Sales Company, Commodity, Customer Region, Trip Number, and the warehouse fields. Repeating Export verifies the staged files. Warehouse codes, ZIP codes, and trip numbers stay as strings.

**Activate** selects the latest available verified expanded snapshot for the next server start, preferring the snapshot with warehouse fields. To restore the original single-company snapshot, stop the server, run `./pilot.ps1 -Action Rollback`, and start it again. Saved reports remain in the library and require a snapshot with their selected fields.

The server listens on `127.0.0.1:8784`. The private launcher authenticates the listener and opens a short-lived sign-in link. The browser removes the sign-in fragment and receives a host-only, HTTP-only session cookie. The server checks host, origin, content type, selected fields and definition version. The bundle, icon and styles are served locally. The CSV directory and local dataset directory have no static HTTP routes.

## Tests

Run the offline regression checks from the project directory with the pilot's Python interpreter.

```powershell
& "$env:LOCALAPPDATA\RDWDW\ReportBuilderPilot\venv\Scripts\python.exe" -B -m unittest -v test_pilot
```

If you set `REPORT_BUILDER_HOME`, use the interpreter in that profile instead. See [AGENTS.md](AGENTS.md) for the setup and verification handoff.

## Integration boundary

The [Superset integration checkpoint](docs/superset-integration.md) records the 6.1.0 source review, the compiler and PostgreSQL checks, and the first publish-to-Explore test for the Linux instance.

- `ui/src/ScheduleEditor.tsx` edits timing and recipients through the asynchronous `ScheduleDraftStore` contract in `scheduleDrafts.ts`. The pilot adapter stores drafts by report ID in browser local storage. A future authenticated service can implement this contract and handle delivery. Browser data clearing removes these drafts.
- `ui/src/ReportWorkspace.tsx` connects the library, read-only results and editor. `LibraryClient` covers folder management, Trash and paged results. Existing report JSON without folder metadata appears in the library root.

- `ui/src/ReportBuilder.tsx` renders the editor against the typed `ReportClient` interface in `ui/src/client.ts`. Browser startup, pilot authentication and the standalone mount live in `index.tsx`.
- `model.py` defines field IDs, types and the two many-to-one relationships from Sales. `csv_source.py` executes selections against CSV data. `report_store.py` stores the ordered definition and revision. `app.py` supplies a Flask API blueprint and a standalone Windows host.
- The later Superset integration can supply its catalog and authenticated client, use an authorized query executor and persist Superset dataset IDs with these definitions. Superset-specific publication, Explore, dynamic mapping and row/column policies require testing against the selected fork.

The React baseline follows the upstream [Superset 6.1.0 frontend manifest](https://github.com/apache/superset/blob/6.1.0/superset-frontend/package.json). The standalone host uses the same Python web framework as [Superset's app factory](https://github.com/apache/superset/blob/6.1.0/superset/app.py).

The development pilot's header uses the logo image from the [Apache Superset 6.1.0 frontend](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/assets/images/superset-logo-horiz.png) under the [Apache License 2.0](ui/superset-logo.LICENSE.txt).
