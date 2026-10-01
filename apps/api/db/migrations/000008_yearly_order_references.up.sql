CREATE TABLE store_order_counters (
    store_id UUID NOT NULL REFERENCES stores(id),
    order_year INTEGER NOT NULL CHECK (order_year > 0),
    next_order_number BIGINT NOT NULL CHECK (next_order_number > 0),
    PRIMARY KEY (store_id, order_year)
);

-- Keep old references unchanged. Count old orders so the first new number
-- in an existing year follows the orders already completed that year.
INSERT INTO store_order_counters (store_id, order_year, next_order_number)
SELECT store_id, EXTRACT(YEAR FROM completed_at AT TIME ZONE 'Asia/Jakarta')::INTEGER, count(*) + 1
FROM sales
GROUP BY store_id, EXTRACT(YEAR FROM completed_at AT TIME ZONE 'Asia/Jakarta')::INTEGER;

ALTER TABLE sales ALTER COLUMN reference DROP EXPRESSION;
ALTER TABLE sales ALTER COLUMN reference SET NOT NULL;
ALTER TABLE sales ADD COLUMN order_year INTEGER CHECK (order_year > 0);
DROP INDEX sales_store_order_number;
CREATE UNIQUE INDEX sales_store_year_order_number ON sales (store_id, order_year, order_number) WHERE order_year IS NOT NULL;
CREATE UNIQUE INDEX sales_store_reference ON sales (store_id, reference);
ALTER TABLE stores DROP COLUMN next_order_number;
