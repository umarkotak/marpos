ALTER TABLE sales ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN deleted_by UUID REFERENCES users(id);
CREATE INDEX sales_active_history ON sales(store_id, completed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE store_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX store_invitations_one_per_user ON store_invitations(store_id, lower(email));
