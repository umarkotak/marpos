ALTER TABLE sale_items ADD COLUMN discount_per_unit BIGINT NOT NULL DEFAULT 0 CHECK (discount_per_unit >= 0);
