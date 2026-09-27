DROP INDEX sales_store_order_number;
ALTER TABLE sales DROP COLUMN reference;
ALTER TABLE sales DROP COLUMN order_number;
ALTER TABLE stores DROP COLUMN next_order_number;
