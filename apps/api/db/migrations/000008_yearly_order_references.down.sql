-- An old store-wide sequence cannot represent repeated numbers from different years.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM sales GROUP BY store_id, order_number HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Cannot restore store-wide order numbers after a yearly number repeats';
    END IF;
END $$;

DROP INDEX sales_store_reference;
DROP INDEX sales_store_year_order_number;
ALTER TABLE sales DROP COLUMN order_year;
ALTER TABLE sales DROP COLUMN reference;
ALTER TABLE sales ADD COLUMN reference TEXT GENERATED ALWAYS AS
    ('MP-' || store_id::text || '-' || order_number::text) STORED;
CREATE UNIQUE INDEX sales_store_order_number ON sales (store_id, order_number);
ALTER TABLE stores ADD COLUMN next_order_number BIGINT NOT NULL DEFAULT 1 CHECK (next_order_number > 0);
UPDATE stores st SET next_order_number = COALESCE(
    (SELECT max(s.order_number) + 1 FROM sales s WHERE s.store_id = st.id), 1
);
DROP TABLE store_order_counters;
