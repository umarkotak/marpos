BEGIN;

WITH menu (sku, name, category, price) AS (
    VALUES
        ('KMU-001', 'Nasi Kuning',          'makanan',       10000),
        ('KMU-002', 'Nasi Uduk',            'makanan',       10000),
        ('KMU-003', 'Nasi Goreng',          'makanan',       13000),
        ('KMU-004', 'Bakso',                'makanan',       13000),
        ('KMU-005', 'Mie Rebus',            'makanan',       13000),
        ('KMU-006', 'Mie Tiaw Goreng',      'makanan',       13000),
        ('KMU-007', 'Mie Dower',            'makanan',       10000),
        ('KMU-008', 'Teh (Dingin/Hangat)',  'minuman',        5000),
        ('KMU-009', 'Es Jeruk Kecil',       'minuman',        5000),
        ('KMU-010', 'Es Jeruk Besar',       'minuman',        7000),
        ('KMU-011', 'Orange Tea',           'minuman',        7000),
        ('KMU-012', 'Milo (Dingin/Hangat)', 'minuman',       10000),
        ('KMU-013', 'Mix Squash',           'minuman',       10000),
        ('KMU-014', 'Matcha',               'minuman',       10000),
        ('KMU-015', 'Avo Cream',            'minuman',       10000),
        ('KMU-016', 'Choco Melt',           'minuman',       10000),
        ('KMU-017', 'Malt Choco',           'minuman',       10000),
        ('KMU-018', 'Hazel Choco',          'minuman',       10000),
        ('KMU-019', 'Berry Cream',          'minuman',       10000),
        ('KMU-020', 'Date Tea',             'minuman',       10000),
        ('KMU-021', 'Velvet Kiss',          'minuman',       10000),
        ('KMU-022', 'Vanilla Cream',        'minuman',       10000),
        ('KMU-023', 'Mineral Botol',        'minuman',        6000),
        ('KMU-024', 'Air Putih Es',         'minuman',        2000),
        ('KMU-025', 'Mineral Gelas',        'minuman',        2000),
        ('KMU-026', 'Kopi Kurma',           'coffee series',  10000),
        ('KMU-027', 'Aren Milky',           'coffee series',  10000),
        ('KMU-028', 'Cappu Cream',          'coffee series',  10000),
        ('KMU-029', 'Caramel Brew',         'coffee series',  10000),
        ('KMU-030', 'Vanilla Cloud',        'coffee series',  10000),
        ('KMU-031', 'Kopi Hitam',           'coffee series',   7000),
        ('KMU-032', 'Sosis Goreng',         'tambahan',        3000),
        ('KMU-033', 'Kentang Goreng',       'tambahan',       10000)
),
inserted AS (
    INSERT INTO products (store_id, sku, name, category)
    SELECT 'a6e74cce-1421-44c5-b2c6-bbc4a70aac72'::uuid, sku, name, category
    FROM menu
    RETURNING id, sku, store_id
),
priced AS (
    INSERT INTO product_prices (product_id, amount)
    SELECT i.id, m.price
    FROM inserted i
    JOIN menu m USING (sku)
    RETURNING product_id
),
versioned AS (
    UPDATE stores
    SET sync_version = sync_version + (SELECT count(*) FROM priced)
    WHERE id = 'a6e74cce-1421-44c5-b2c6-bbc4a70aac72'::uuid
    RETURNING sync_version
)
INSERT INTO sync_changes
    (store_id, sequence, entity_type, entity_id, operation, payload)
SELECT
    i.store_id,
    v.sync_version - (SELECT count(*) FROM priced)
        + row_number() OVER (ORDER BY i.sku),
    'product',
    i.id,
    'updated',
    jsonb_build_object('id', i.id::text)
FROM inserted i
JOIN priced p ON p.product_id = i.id
CROSS JOIN versioned v;

COMMIT;