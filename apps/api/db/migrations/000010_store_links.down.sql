ALTER TABLE stores DROP COLUMN google_maps_url;
DROP INDEX stores_slug_unique;
ALTER TABLE stores DROP COLUMN slug;
