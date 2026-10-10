ALTER TABLE sales ADD COLUMN payment_method_note TEXT NOT NULL DEFAULT ''
    CHECK (payment_method_note IN ('', 'unpaid', 'qris', 'cash'));
