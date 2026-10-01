package store_handler

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v3"
	"github.com/jmoiron/sqlx"
	"github.com/umarkotak/marpos/apps/api/audit"
	"github.com/umarkotak/marpos/apps/api/config"
	"github.com/umarkotak/marpos/apps/api/datastore"
	"github.com/umarkotak/marpos/apps/api/handlers/auth_handler"
	"github.com/umarkotak/marpos/apps/api/utils/render"
)

func ClearOrders(c fiber.Ctx) error   { return clearStoreData(c, false) }
func ClearProducts(c fiber.Ctx) error { return clearStoreData(c, true) }

func clearStoreData(c fiber.Ctx, products bool) error {
	storeID := c.Params("store_id")
	role := auth_handler.StoreRole(c, storeID)
	if !config.Get().DangerZoneEnabled || role == "" || (role != "owner" && !auth_handler.IsSuperadmin(c)) {
		return render.Failure(c, 403, "danger_zone_disabled", "This action is not available.")
	}
	var input struct {
		ConfirmStoreName string `json:"confirm_store_name"`
	}
	if err := c.Bind().Body(&input); err != nil {
		return render.Failure(c, 400, "invalid_request", "Enter the store name to confirm.")
	}
	tx, err := datastore.Get().Db.BeginTxx(c.Context(), nil)
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not clear store data.")
	}
	defer tx.Rollback()
	var storeName string
	if err = tx.Get(&storeName, `SELECT name FROM stores WHERE id=$1 FOR UPDATE`, storeID); err != nil {
		return render.Failure(c, 404, "store_not_found", "Store was not found.")
	}
	if input.ConfirmStoreName != storeName {
		return render.Failure(c, 400, "confirmation_required", "Enter the exact store name to confirm.")
	}
	if err = deleteOrders(tx, storeID); err == nil && products {
		err = deleteProducts(tx, storeID)
	}
	if err != nil {
		return render.Failure(c, 500, "database_error", "Could not clear store data.")
	}
	action := "store.orders_cleared"
	if products {
		action = "store.products_cleared"
	}
	if err = audit.Write(tx, storeID, c.Locals("user_id").(string), action, "store", storeID, map[string]any{}); err != nil {
		return render.Failure(c, 500, "audit_error", "Could not record the clear action.")
	}
	if err = tx.Commit(); err != nil {
		return render.Failure(c, 500, "database_error", "Could not clear store data.")
	}
	if products {
		if err := os.RemoveAll(filepath.Join(config.Get().StorageDir, storeID)); err != nil {
			log.Printf("could not remove images for store %s: %v", storeID, err)
		}
	}
	return render.Response(c, 200, fiber.Map{"cleared": true})
}

func deleteOrders(tx *sqlx.Tx, storeID string) error {
	queries := []string{
		`DELETE FROM return_items WHERE return_id IN (SELECT r.id FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.store_id=$1)`,
		`DELETE FROM returns WHERE sale_id IN (SELECT id FROM sales WHERE store_id=$1)`,
		`DELETE FROM refunds WHERE sale_id IN (SELECT id FROM sales WHERE store_id=$1)`,
		`DELETE FROM receipts WHERE sale_id IN (SELECT id FROM sales WHERE store_id=$1)`,
		`DELETE FROM sale_item_addons WHERE sale_item_id IN (SELECT id FROM sale_items WHERE store_id=$1)`,
		`DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE store_id=$1)`,
		`DELETE FROM sale_items WHERE store_id=$1`,
		`DELETE FROM sales WHERE store_id=$1`,
		`DELETE FROM store_order_counters WHERE store_id=$1`,
		`DELETE FROM audit_logs WHERE store_id=$1 AND entity_type='sale'`,
		`UPDATE stores SET orders_cleared_at=clock_timestamp() WHERE id=$1`,
	}
	for _, query := range queries {
		if _, err := tx.Exec(query, storeID); err != nil {
			return err
		}
	}
	return nil
}

func deleteProducts(tx *sqlx.Tx, storeID string) error {
	queries := []string{
		`DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT gr.id FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.purchase_order_id WHERE po.store_id=$1)`,
		`DELETE FROM goods_receipts WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE store_id=$1)`,
		`DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE store_id=$1)`,
		`DELETE FROM purchase_orders WHERE store_id=$1`,
		`DELETE FROM inventory_movements WHERE store_id=$1`,
		`DELETE FROM addon_options WHERE group_id IN (SELECT id FROM addon_groups WHERE store_id=$1)`,
		`DELETE FROM addon_groups WHERE store_id=$1`,
		`DELETE FROM product_prices WHERE product_id IN (SELECT id FROM products WHERE store_id=$1)`,
		`DELETE FROM products WHERE store_id=$1`,
		`DELETE FROM sync_changes WHERE store_id=$1 AND entity_type='product'`,
		`DELETE FROM audit_logs WHERE store_id=$1 AND entity_type='product'`,
	}
	for _, query := range queries {
		if _, err := tx.Exec(query, storeID); err != nil {
			return err
		}
	}
	return nil
}
