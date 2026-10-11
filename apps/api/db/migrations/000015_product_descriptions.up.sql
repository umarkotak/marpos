ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE sale_items ADD COLUMN product_description TEXT NOT NULL DEFAULT '';
