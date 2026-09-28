ALTER TABLE products ADD COLUMN image_urls JSONB NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(image_urls) = 'array' AND jsonb_array_length(image_urls) <= 10);
