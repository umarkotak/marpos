DROP TABLE store_invitations;
DROP INDEX sales_active_history;
ALTER TABLE sales DROP COLUMN deleted_by;
ALTER TABLE sales DROP COLUMN deleted_at;
