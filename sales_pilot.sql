-- Sales reporting dates November 9–15, 2026 for companies 0001 and 0030.
-- By default return aggregate verification through the read-only Cognos interface.
-- The exporter uses stream_rows to read relations and checks in one SELECT.
\set ON_ERROR_STOP on
\if :{?stream_rows}
\else
  \set stream_rows off
\endif

SELECT $relations$
WITH pilot_companies AS (
    SELECT company_key, company FROM public.dim_companies WHERE company IN ('0001','0030')
), pilot_sales AS (
    SELECT f.time_key, f.company_key, f.it_key, f.lot_key, d.date AS reporting_date,
           f.customer_key, f.product_key, f.sales::numeric AS sales, f.creditsales::numeric AS creditsales,
           f.shipquantitycseq::numeric AS shipquantitycseq, c.company, f.trip_key
    FROM public.fact_sales f
    JOIN public.dim_time d ON d.time_key = f.time_key
    JOIN pilot_companies c ON c.company_key = f.company_key
    WHERE d.date >= DATE '2026-11-09' AND d.date < DATE '2026-11-16'
), pilot_customers AS (
    SELECT customer_key, customercompany, customer, customername, shippingcity, shippingstate,
           customerregiondescription, shippingzip, salesparentcustomername
    FROM public.dim_customers WHERE customer_key IN (SELECT customer_key FROM pilot_sales)
), pilot_products AS (
    SELECT product_key, productcompany, productnumber, productdesc, packaging,
           departmentdescription, commoditydescription, classdescription
    FROM public.dim_products WHERE product_key IN (SELECT product_key FROM pilot_sales)
), pilot_trips AS (
    SELECT trip_key, tripnumber, tripdescription, dispatchdatetime::date AS dispatchdate, dispatchdatetime
    FROM public.dim_trips WHERE trip_key IN (SELECT trip_key FROM pilot_sales)
), pilot_joined AS (
    SELECT f.*, c.customer_key AS matched_customer, p.product_key AS matched_product,
           t.trip_key AS matched_trip, p.commoditydescription, c.customerregiondescription, t.tripnumber
    FROM pilot_sales f
    LEFT JOIN pilot_customers c ON c.customer_key = f.customer_key
    LEFT JOIN pilot_products p ON p.product_key = f.product_key
    LEFT JOIN pilot_trips t ON t.trip_key = f.trip_key
), before_checks AS (
    SELECT coalesce(company,'combined') AS scope, count(*) AS rows,
           count(DISTINCT (time_key, company_key, it_key, lot_key)) AS distinct_fact_keys,
           sum(sales) AS sales, sum(creditsales) AS creditsales, sum(shipquantitycseq) AS shipquantitycseq
    FROM pilot_sales GROUP BY GROUPING SETS ((company), ())
), after_checks AS (
    SELECT coalesce(company,'combined') AS scope, count(*) AS rows,
           count(*) FILTER (WHERE matched_customer IS NULL) AS missing_customers,
           count(*) FILTER (WHERE matched_product IS NULL) AS missing_products,
           count(*) FILTER (WHERE trip_key IS NOT NULL AND matched_trip IS NULL) AS missing_trips,
           count(*) FILTER (WHERE trip_key IS NULL) AS unassigned_trips,
           sum(sales) AS sales, sum(creditsales) AS creditsales, sum(shipquantitycseq) AS shipquantitycseq
    FROM pilot_joined GROUP BY GROUPING SETS ((company), ())
), pilot_verification AS (
    SELECT json_build_object(
        'source_database', current_database(), 'snapshot_at', transaction_timestamp(),
        'before_joins', (SELECT row_to_json(b) FROM before_checks b WHERE scope = 'combined'),
        'after_joins', (SELECT row_to_json(a) FROM after_checks a WHERE scope = 'combined'),
        'by_company', (SELECT json_object_agg(scope,row_to_json(b)) FROM before_checks b WHERE scope <> 'combined'),
        'after_by_company', (SELECT json_object_agg(scope,row_to_json(a)) FROM after_checks a WHERE scope <> 'combined'),
        'dimension_rows', json_build_object('customers',(SELECT count(*) FROM pilot_customers),
                                            'products',(SELECT count(*) FROM pilot_products),
                                            'trips',(SELECT count(*) FROM pilot_trips)),
        'passed', (SELECT count(*) = 2 AND count(DISTINCT company) = 2
                          AND count(DISTINCT company_key) = 2 FROM pilot_companies)
                 AND (SELECT count(*) = 3 AND bool_and(b.rows > 0 AND b.rows = b.distinct_fact_keys AND b.rows = a.rows
                          AND a.missing_customers = 0 AND a.missing_products = 0 AND a.missing_trips = 0
                          AND b.sales IS NOT DISTINCT FROM a.sales AND b.creditsales IS NOT DISTINCT FROM a.creditsales
                          AND b.shipquantitycseq IS NOT DISTINCT FROM a.shipquantitycseq)
                      FROM before_checks b JOIN after_checks a USING (scope))
    ) AS verification
), pilot_summary AS (
    SELECT company, commoditydescription, customerregiondescription, tripnumber,
           sum(sales) AS sales, sum(creditsales) AS creditsales, sum(shipquantitycseq) AS shipquantitycseq
    FROM pilot_joined GROUP BY company, commoditydescription, customerregiondescription, tripnumber
)
$relations$ AS pilot_relations
\gset

\if :stream_rows
  SELECT payload
  FROM pprodw_cognos.remote(:'pilot_relations' || $stream$
      SELECT json_build_array('fact_sales', row_to_json(f))::text FROM pilot_sales f
      UNION ALL SELECT json_build_array('dim_customers', row_to_json(c))::text FROM pilot_customers c
      UNION ALL SELECT json_build_array('dim_products', row_to_json(p))::text FROM pilot_products p
      UNION ALL SELECT json_build_array('dim_trips', row_to_json(t))::text FROM pilot_trips t
      UNION ALL SELECT json_build_array('summary', row_to_json(s))::text FROM pilot_summary s
      UNION ALL SELECT json_build_array('verification', verification)::text FROM pilot_verification
  $stream$) AS r(payload text);
\else
  SELECT verification::jsonb
  FROM pprodw_cognos.remote(:'pilot_relations' ||
      ' SELECT verification::text FROM pilot_verification') AS r(verification text);
\endif
