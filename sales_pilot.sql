-- [Proposed] Company 0030, November 9 through 15, 2026, by fact_sales.time_key.
-- In psql on rdwdw, run this file to verify the live extract. It returns one
-- summary through the documented pprodw_cognos.remote(text) interface.
-- In psql connected directly to pprodw_cognos, pass -v extract_rows=on to
-- return the three relational result sets and the checks in one source snapshot.
\set ON_ERROR_STOP on
\if :{?extract_rows}
\else
  \set extract_rows off
\endif
\if :{?stream_rows}
\else
  \set stream_rows off
\endif

-- All four queries use these exact definitions. Keep source values and signs.
SELECT $relations$
WITH pilot_sales AS (
    SELECT f.time_key, f.company_key, f.it_key, f.lot_key,
           d.date AS reporting_date, f.customer_key, f.product_key,
           f.sales, f.creditsales, f.shipquantitycseq
    FROM public.fact_sales AS f
    JOIN public.dim_time AS d ON d.time_key = f.time_key
    WHERE f.company_key = (
        SELECT company_key FROM public.dim_companies WHERE company = '0030'
    )
      AND d.date >= DATE '2026-11-09'
      AND d.date <  DATE '2026-11-16'
), pilot_customers AS (
    -- Shipping city and state come from the customer master linked by customer_key.
    SELECT c.customer_key, c.customercompany, c.customer, c.customername,
           c.shippingcity, c.shippingstate
    FROM public.dim_customers AS c
    WHERE c.customer_key IN (SELECT customer_key FROM pilot_sales)
), pilot_products AS (
    SELECT p.product_key, p.productcompany, p.productnumber, p.productdesc, p.packaging
    FROM public.dim_products AS p
    WHERE p.product_key IN (SELECT product_key FROM pilot_sales)
)
$relations$ AS pilot_relations
\gset

SELECT $checks$
, baseline AS (
    SELECT count(*) AS rows,
           count(DISTINCT (time_key, company_key, it_key, lot_key)) AS distinct_fact_keys,
           count(DISTINCT reporting_date) AS reporting_days,
           count(DISTINCT customer_key) AS customer_keys,
           count(DISTINCT product_key) AS product_keys,
           sum(sales::numeric) AS sales,
           sum(creditsales::numeric) AS creditsales,
           sum(shipquantitycseq::numeric) AS shipquantitycseq
    FROM pilot_sales
), dimensions AS (
    SELECT (SELECT count(*) FROM pilot_customers) AS customers,
           (SELECT count(*) FROM pilot_products) AS products
), joined AS (
    SELECT count(*) AS rows,
           count(*) FILTER (WHERE c.customer_key IS NULL) AS missing_customers,
           count(*) FILTER (WHERE p.product_key IS NULL) AS missing_products,
           sum(f.sales::numeric) AS sales,
           sum(f.creditsales::numeric) AS creditsales,
           sum(f.shipquantitycseq::numeric) AS shipquantitycseq
    FROM pilot_sales AS f
    LEFT JOIN pilot_customers AS c ON c.customer_key = f.customer_key
    LEFT JOIN pilot_products AS p ON p.product_key = f.product_key
), pilot_verification AS (
SELECT json_build_object(
    'source_database', current_database(), 'snapshot_at', transaction_timestamp(),
    'before_joins', row_to_json(b), 'dimension_rows', row_to_json(d),
    'after_joins', row_to_json(j),
    'passed', b.rows > 0 AND b.rows = b.distinct_fact_keys AND b.rows = j.rows
              AND b.customer_keys = d.customers AND b.product_keys = d.products
              AND j.missing_customers = 0 AND j.missing_products = 0
              AND b.sales IS NOT DISTINCT FROM j.sales
              AND b.creditsales IS NOT DISTINCT FROM j.creditsales
              AND b.shipquantitycseq IS NOT DISTINCT FROM j.shipquantitycseq
)::text AS verification
FROM baseline AS b CROSS JOIN dimensions AS d CROSS JOIN joined AS j
)
$checks$ AS pilot_checks
\gset

\if :extract_rows
  BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
  \echo fact_sales
  :pilot_relations SELECT * FROM pilot_sales ORDER BY time_key, company_key, it_key, lot_key;
  \echo dim_customers
  :pilot_relations SELECT * FROM pilot_customers ORDER BY customer_key;
  \echo dim_products
  :pilot_relations SELECT * FROM pilot_products ORDER BY product_key;
  \echo verification
  :pilot_relations :pilot_checks SELECT verification FROM pilot_verification;
  COMMIT;
\elif :stream_rows
  -- One remote SELECT gives the exporter all three relations and their controls
  -- from one source snapshot. JSON keeps embedded newlines inside one record.
  SELECT payload
  FROM pprodw_cognos.remote(:'pilot_relations' || :'pilot_checks' || $stream$
      SELECT json_build_array('fact_sales', row_to_json(exported))::text
      FROM (
          SELECT time_key, company_key, it_key, lot_key, reporting_date, customer_key, product_key,
                 sales::numeric AS sales, creditsales::numeric AS creditsales,
                 shipquantitycseq::numeric AS shipquantitycseq
          FROM pilot_sales
      ) AS exported
      UNION ALL SELECT json_build_array('dim_customers', row_to_json(c))::text FROM pilot_customers c
      UNION ALL SELECT json_build_array('dim_products', row_to_json(p))::text FROM pilot_products p
      UNION ALL SELECT json_build_array('verification', v.verification::json)::text FROM pilot_verification v
  $stream$) AS r(payload text);
\else
  SELECT verification::jsonb
  FROM pprodw_cognos.remote(:'pilot_relations' || :'pilot_checks' ||
       ' SELECT verification FROM pilot_verification') AS r(verification text);
\endif
