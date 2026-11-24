# Report Builder

A Windows, single-user CSV pilot for composing sales reports. Open **Open Report Builder.cmd** to start the loopback service and open an authorized tab in your default browser. The launcher can also reopen an expired browser session.

## Use the builder

The pilot opens to **Reports**. Search by name, choose a **Location** to browse folders or Trash, or sort by **Name** or **Last modified**. Select a report name or **Run** to see a read-only result with 50 rows per page. **Edit** opens the report in the builder. **New report** starts an empty definition in the current folder.

Open **Folders** and use the plus beside its heading to create a folder or subfolder. Open a folder and choose **Manage folder** to rename or move it. A report's **…** button moves it to another folder or to **Trash**. Restore a report from Trash to return it to its former folder, or to the library root if that folder was removed. If its name has been reused, the restored copy receives a suffix. Choose the trash icon beside a folder or choose **Delete folder** in **Manage folder**. Confirming moves its reports and subfolders up one level.

In **Trash**, choose **Delete permanently** and confirm to remove a saved report. This also removes its schedule draft from the browser where you confirm the deletion.

**Schedule** opens a delivery draft for the selected report. Choose a recurrence, local time, time zone and To, Cc and Bcc recipients. One draft per report is saved in this browser profile. Opening Schedule again lets you edit or remove it. Email delivery is inactive.

1. In **Objects**, expand Sales, Customers, Products, Trips, or Warehouses, or search for a field. Click fields or drag them into **Columns** in **Query**. Drag columns to reorder them. **Warehouse Code**, **Warehouse Name**, and **Warehouse Company** describe the warehouse recorded on the sale.
2. In **Columns**, non-numeric fields group the results by default. For numeric fields, use the dropdown to choose a calculation. **Count** counts nonblank values, and **None** keeps a column for detail rows. When no columns define groups, clear **Totals only** to see one row per sale. The **?** icon shows both views.
3. In **Columns**, turn on **Sort** for each visible column and choose **Asc** or **Desc**. **Run preview** in the **Preview** header displays the first 50 matching rows after sorting and sizes columns to those rows. Use the pencil in **Columns** or **Filters** to rename a field throughout the report. Hover over the name to see its original table and column.
4. Choose **Save report** and give the definition a name. Choose **Reports** to return to the library. Saving an existing report updates its revision. If another tab saved first, reopen that revision before editing again.

With no groups selected, **Totals only** calculates the selected aggregations across all matching sales in one row.

With the expanded snapshot active, a new report includes sales for `0001` and `0030`. Use **Sales company** to group or filter by the company on the sale. Reports saved before the expansion still use `0030`. To broaden one, open it, choose **Include both companies** in Query, run the preview, and save the updated definition. An unassigned trip displays blank trip fields.

**Columns** starts open in a new report and lists all selected columns. Choose **Show less** to list the first three. The outer divider between **Build Report** and **Preview** resizes the whole Build Report pane. The inner divider adjusts how much of that width **Objects** and **Query** each take up. Drag either divider, or focus it and use the left and right arrow keys. The **Objects** and **Query** headings collapse their panes, and **Columns** and **Filters** collapse independently.

Drag a field by its name or grip to move its output column, or focus it and press the up/down arrows. Use **Priority** to order the enabled sorts independently. Priority **1** sorts first and **2** breaks its ties. Choosing a priority shifts the other ranks automatically. New or re-enabled sorts take the last priority. Disabling a sort remembers its direction and releases its rank. With all sorts off, rows and summary groups follow their first occurrence in the filtered source. Older saved definitions start with the precedence they had under column-based sorting.

Drag a preview header by its label to move the column and its values immediately. The numbered **Column Order** list in **Columns** follows that move. A focused header label also supports left and right arrow keys. Use **Sort**, **Priority**, and **Direction** to order the rows. After adding or removing fields, run the preview to enable header dragging for the new selection.

Drag the right edge of any preview column header to widen or narrow it. A focused divider also responds to left and right arrow keys. Widths follow their columns and carry over when rerunning a preview in the same editor session. **Auto-fit columns** restores automatic sizing.

Drag a library field into **Filters**, or choose **Add filter**. With **is any of**, search the CSV values, check one or more, or type a custom value and choose **Use**. Turn on **Match case** to match text exactly as capitalized. For a date or date and time field, **relative to now** recalculates when the report runs. Days and weeks include today, and date and time fields also support hours counted from the current local time. Choose **Apply filter**, then **Run preview**. Any chosen value can match within a rule, and all enabled rules must match before totals are calculated.

Click the title to rename the draft. Choose **Apply title**, then **Save report** to persist it. Saving under another report's name prompts for confirmation. **Replace report** updates the named target. When editing a different previously saved report, its original definition stays available under its original name.

## Local operation

Run these commands from the project directory. Setup needs Python 3.13, Node, pnpm and the PostgreSQL client on PATH. The built pilot needs only its private Python environment, compiled UI, and CSV snapshot.

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

The server listens on `127.0.0.1:8784`. The private launcher authenticates the listener and opens a short-lived sign-in link. The browser removes the sign-in fragment and receives a host-only, HTTP-only session cookie. The server checks host, origin, content type, selected fields and definition version. The bundle, icon and styles are served locally. The CSV directory and reports directory have no static HTTP routes.

Run the offline regression checks from the project directory with the pilot's Python interpreter.

```powershell
& "$env:LOCALAPPDATA\RDWDW\ReportBuilderPilot\venv\Scripts\python.exe" -B -m unittest -v test_pilot
```

## Integration boundary

The [Superset integration checkpoint](docs/superset-integration.md) records the 6.1.0 source review, the compiler and PostgreSQL checks, and the first publish-to-Explore test for the Linux instance.

- `ui/src/ScheduleEditor.tsx` edits timing and recipients through the asynchronous `ScheduleDraftStore` contract in `scheduleDrafts.ts`. The pilot adapter stores drafts by report ID in browser local storage. A future authenticated service can implement this contract and handle delivery. Browser data clearing removes these drafts.
- `ui/src/ReportWorkspace.tsx` connects the library, read-only results and editor. `LibraryClient` covers folder management, Trash and paged results. Existing report JSON without folder metadata appears in the library root.

- `ui/src/ReportBuilder.tsx` renders the editor against the typed `ReportClient` interface in `ui/src/client.ts`. Browser startup, pilot authentication and the standalone mount live in `index.tsx`.
- `model.py` defines field IDs, types and the two many-to-one relationships from Sales. `csv_source.py` executes selections against CSV data. `report_store.py` stores the ordered definition and revision. `app.py` supplies a Flask API blueprint and a standalone Windows host.
- The later Superset integration can supply its catalog and authenticated client, use an authorized query executor and persist Superset dataset IDs with these definitions. Superset-specific publication, Explore, dynamic mapping and row/column policies require testing against the selected fork.

The React baseline follows the upstream [Superset 6.1.0 frontend manifest](https://github.com/apache/superset/blob/6.1.0/superset-frontend/package.json). The standalone host uses the same Python web framework as [Superset's app factory](https://github.com/apache/superset/blob/6.1.0/superset/app.py).

The development pilot's header uses the logo image from the [Apache Superset 6.1.0 frontend](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/assets/images/superset-logo-horiz.png) under the [Apache License 2.0](ui/superset-logo.LICENSE.txt).
