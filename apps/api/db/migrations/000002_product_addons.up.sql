CREATE TABLE addon_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    name TEXT NOT NULL,
    selection_mode TEXT NOT NULL CHECK (selection_mode IN ('single', 'multiple')),
    required BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, id),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id)
);
CREATE UNIQUE INDEX addon_groups_active_name ON addon_groups(product_id, name) WHERE active;

CREATE TABLE addon_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES addon_groups(id),
    name TEXT NOT NULL,
    price_delta BIGINT NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX addon_options_active_name ON addon_options(group_id, name) WHERE active;

CREATE TABLE sale_item_addons (
    id UUID PRIMARY KEY,
    sale_item_id UUID NOT NULL REFERENCES sale_items(id),
    option_id UUID NOT NULL REFERENCES addon_options(id),
    group_name TEXT NOT NULL,
    option_name TEXT NOT NULL,
    price_delta BIGINT NOT NULL CHECK (price_delta >= 0),
    UNIQUE (sale_item_id, option_id)
);
