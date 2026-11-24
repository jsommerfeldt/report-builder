# Apache Superset UI screenshot reference

Reviewed November 23, 2026.

[High Confidence] These screenshots show the main Apache Superset screens across several releases. Use them to compare page structure and workflows. Labels, colors, and available actions can vary by release, theme, and permissions. Explore is the closest reference for the Report Builder editor.

## Home

[High Confidence] The landing page groups recent activity, dashboards, charts, and saved queries. [Superset GitHub screenshot source](https://github.com/apache/superset/issues/22758)

![Superset Home with sections for recent activity, dashboards, and charts](https://user-images.githubusercontent.com/118770354/212996336-93224d1e-2a29-4994-989a-0871dab6a13d.png)

## Dashboards

[High Confidence] The library lists dashboards with search, filters, ownership, and draft or published status. [Elestio walkthrough](https://blog.elest.io/using-superset-for-real-time-data-analytics/)

![Superset Dashboards list with filters and published dashboard rows](https://blog.elest.io/content/images/2024/10/Screenshot-2024-10-03-at-1.29.08-PM.jpg)

### Open dashboard

[High Confidence] Opening a dashboard takes you to a canvas of charts and filters. This tutorial capture shows the canvas in edit mode. [Apache Superset dashboard tutorial](https://superset.apache.org/user-docs/6.1.0/using-superset/exploring-data/#dashboard-basics)

![Superset dashboard in edit mode with a line chart, filter, and pivot table](https://superset.apache.org/img/tutorial/publish_dashboard.png)

## Charts

[High Confidence] The saved-chart library lists each chart’s name, visualization type, and dataset. This capture shows an older layout. [Superset GitHub screenshot source](https://github.com/apache/superset/issues/15118)

![Superset Charts list with chart type and dataset filters](https://user-images.githubusercontent.com/2016594/121795285-edd48300-cc41-11eb-8bb1-6a998a106394.png)

## Explore

[High Confidence] The chart editor puts source columns and metrics on the left, query and formatting controls in the middle, and the chart and result rows on the right. Superset uses Explore for tables and graphs. [Apache Superset Explore tutorial](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/#creating-charts-in-explore-view) · [Table chart screenshot](https://superset.apache.org/img/tutorial/tutorial_table.png)

![Superset Explore with source fields, query controls, chart preview, and result rows](https://superset.apache.org/img/tutorial/tutorial_explore_settings.jpg)

## Datasets

[High Confidence] The library shows registered datasets, including their database, schema, and physical or virtual type. [Apache Superset dataset tutorial](https://superset.apache.org/user-docs/6.1.0/using-superset/creating-your-first-dashboard/#registering-a-new-table)

![Superset Datasets list with database, schema, and type columns](https://superset.apache.org/img/tutorial/tutorial_launch_explore.png)

## SQL Lab

[High Confidence] The SQL workspace has a database and table browser on the left, a query editor above, and a results grid below. [Apache Superset screenshot gallery](https://github.com/apache/superset#screenshots)

![Superset SQL Lab with a schema browser, SQL editor, and results grid](https://superset.apache.org/img/screenshots/sql_lab.jpg)

## Related project references

- [Superset integration checkpoint](superset-integration.md)
- [Superset source integration notes](superset-source-integration.md)
