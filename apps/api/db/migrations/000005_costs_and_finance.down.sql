DROP TABLE finance_entries;
ALTER TABLE sale_items DROP COLUMN cost_breakdown, DROP COLUMN cost_configured, DROP COLUMN unit_cost;
ALTER TABLE addon_options DROP COLUMN cost_delta;
ALTER TABLE products DROP COLUMN cost_configured, DROP COLUMN cost_breakdown;
