ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'lainnya'
    CHECK (char_length(btrim(category)) BETWEEN 1 AND 100);
