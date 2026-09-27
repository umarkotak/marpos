ALTER TABLE stores ADD COLUMN next_order_number BIGINT NOT NULL DEFAULT 1 CHECK (next_order_number > 0);

ALTER TABLE sales ADD COLUMN order_number BIGINT;
WITH numbered AS (
    SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY completed_at, id) AS number
    FROM sales
)
UPDATE sales s SET order_number = numbered.number FROM numbered WHERE s.id = numbered.id;
ALTER TABLE sales ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE sales ADD COLUMN reference TEXT GENERATED ALWAYS AS
    ('MP-' || store_id::text || '-' || order_number::text) STORED;
CREATE UNIQUE INDEX sales_store_order_number ON sales(store_id, order_number);

UPDATE stores st SET next_order_number = COALESCE(
    (SELECT max(s.order_number) + 1 FROM sales s WHERE s.store_id = st.id), 1
);
