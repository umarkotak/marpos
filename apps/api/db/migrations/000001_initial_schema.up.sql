-- Money is stored as whole IDR. IDs can be supplied by offline clients.
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency_code = 'IDR'),
    tax_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percentage BETWEEN 0 AND 100),
    sync_version BIGINT NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL UNIQUE REFERENCES stores(id), -- one register per store
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_subject TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_store_roles (
    user_id UUID NOT NULL REFERENCES users(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'cashier')),
    PRIMARY KEY (user_id, store_id)
);

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, id),
    UNIQUE (store_id, name)
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    category_id UUID,
    sku TEXT NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (store_id, id),
    UNIQUE (store_id, sku),
    UNIQUE (store_id, barcode),
    FOREIGN KEY (store_id, category_id) REFERENCES product_categories(store_id, id)
);

CREATE TABLE product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ,
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    UNIQUE (product_id, starts_at)
);
CREATE UNIQUE INDEX product_prices_one_current ON product_prices(product_id) WHERE ends_at IS NULL;

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (store_id, id)
);

CREATE TABLE sync_devices (
    id UUID PRIMARY KEY, -- browser-generated device ID
    store_id UUID NOT NULL,
    register_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    last_online_login_at TIMESTAMPTZ NOT NULL,
    offline_expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (offline_expires_at > last_online_login_at),
    UNIQUE (store_id, id),
    FOREIGN KEY (store_id, register_id) REFERENCES registers(store_id, id)
);

CREATE TABLE register_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id UUID NOT NULL REFERENCES registers(id),
    cashier_id UUID NOT NULL REFERENCES users(id),
    opening_cash BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
    expected_cash BIGINT,
    closing_cash BIGINT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX register_sessions_one_open ON register_sessions(register_id) WHERE closed_at IS NULL;

CREATE TABLE sales (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id),
    register_id UUID NOT NULL,
    cashier_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID,
    register_session_id UUID REFERENCES register_sessions(id),
    receipt_number TEXT NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency_code = 'IDR'),
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    discount_total BIGINT NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    tax_applied BOOLEAN NOT NULL DEFAULT true,
    tax_percentage NUMERIC(5,2) NOT NULL CHECK (tax_percentage BETWEEN 0 AND 100),
    tax_total BIGINT NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
    grand_total BIGINT NOT NULL CHECK (grand_total >= 0),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, id),
    UNIQUE (store_id, receipt_number),
    FOREIGN KEY (store_id, register_id) REFERENCES registers(store_id, id),
    FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id),
    CHECK (tax_applied OR tax_total = 0),
    CHECK (completed_at >= created_at)
);
CREATE INDEX sales_store_completed_at ON sales(store_id, completed_at DESC);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    product_id UUID NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    discount_total BIGINT NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    tax_total BIGINT NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (store_id, sale_id) REFERENCES sales(store_id, id),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id)
);
CREATE INDEX sale_items_sale_id ON sale_items(sale_id);

CREATE TABLE payments (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES sales(id),
    payment_method TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_sale_id ON payments(sale_id);

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
    movement_type TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id)
);
CREATE INDEX inventory_movements_product ON inventory_movements(store_id, product_id, created_at);

CREATE TABLE sync_operations (
    id UUID PRIMARY KEY, -- idempotency key from the client
    store_id UUID NOT NULL REFERENCES stores(id),
    device_id UUID NOT NULL,
    operation_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (store_id, device_id) REFERENCES sync_devices(store_id, id)
);
CREATE INDEX sync_operations_store_processed ON sync_operations(store_id, processed_at);

CREATE TABLE sync_changes (
    store_id UUID NOT NULL REFERENCES stores(id),
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, sequence)
);
-- Allocate sequence with UPDATE stores SET sync_version = sync_version + 1
-- in the same transaction as the change. The store row lock keeps commit order.

CREATE TABLE cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_session_id UUID NOT NULL REFERENCES register_sessions(id),
    amount BIGINT NOT NULL CHECK (amount <> 0),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Later features. These tables are present, but V1 does not depend on them.
CREATE TABLE discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL,
    percentage NUMERIC(5,2) CHECK (percentage BETWEEN 0 AND 100),
    amount BIGINT CHECK (amount >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    CHECK ((percentage IS NULL) <> (amount IS NULL))
);

CREATE TABLE tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL,
    percentage NUMERIC(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL,
    contact TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (store_id, id)
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    supplier_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (store_id, supplier_id) REFERENCES suppliers(store_id, id)
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0)
);

CREATE TABLE goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    received_by UUID NOT NULL REFERENCES users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES returns(id),
    sale_item_id UUID NOT NULL REFERENCES sale_items(id),
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    content JSONB NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_store_created ON audit_logs(store_id, created_at DESC);
