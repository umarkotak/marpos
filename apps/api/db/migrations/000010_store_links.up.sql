ALTER TABLE stores ADD COLUMN slug TEXT;
UPDATE stores SET slug = COALESCE(NULLIF(trim(both '-' FROM left(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), 91)), ''), 'store') || '-' || left(replace(id::text, '-', ''), 8);
ALTER TABLE stores ALTER COLUMN slug SET NOT NULL;
ALTER TABLE stores ADD CONSTRAINT stores_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE UNIQUE INDEX stores_slug_unique ON stores (slug);
ALTER TABLE stores ADD COLUMN google_maps_url TEXT NOT NULL DEFAULT '';
