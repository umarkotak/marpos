ALTER TABLE products ADD COLUMN cost_breakdown JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(cost_breakdown) = 'array');
ALTER TABLE products ADD COLUMN cost_configured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE addon_options ADD COLUMN cost_delta BIGINT NOT NULL DEFAULT 0 CHECK (cost_delta BETWEEN 0 AND 1000000000000);
ALTER TABLE sale_items ADD COLUMN unit_cost BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost BETWEEN 0 AND 1000000000000);
ALTER TABLE sale_items ADD COLUMN cost_configured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_items ADD COLUMN cost_breakdown JSONB NOT NULL DEFAULT '[]';

CREATE TABLE finance_entries (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id),
    created_by UUID NOT NULL REFERENCES users(id),
    mode TEXT NOT NULL CHECK (mode IN ('income','expense')),
    category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 1000),
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 1000000000000),
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);
CREATE INDEX finance_entries_store_date ON finance_entries(store_id, occurred_at DESC) WHERE deleted_at IS NULL;
